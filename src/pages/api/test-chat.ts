// src/pages/api/test-chat.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import forestAmbush from "../../prompts/scenarios/forest_ambush";
import { getRollDecision, ArbiterDecision } from "../../services/rolls_dm";

// Feeds (safe, compact serializers) — READ-ONLY views over state
import { characterFeed } from "../../feeds/character_feed";
import { inventoryFeed } from "../../feeds/inventory_feed";
import { contextFeed } from "../../feeds/context_feed";
import { learnedFeed } from "../../feeds/learned_feed";

// Delta applier (applies Rolls DM apply_now / outcome deltas) — MUTATES state
import { applyDeltas, type Delta } from "../../services/delta_applier";

// Observer (promote plausible items from narration) — proposes deltas for state
import { proposeEnvDeltas } from "../../services/narration_observer";

// Read current environment to avoid re-adding items that already exist (state)
import { getEnvironment } from "../../state/environment";

// Roll manager (wire-in only for fixed/opposed; narration unchanged)
import { resolveActionHit } from "../../services/roll_manager";

// SSOT: write scenario kit to STATE inventory at init (feeds only read from state)
import { setInventory as setStateInventory } from "../../state/inventory";

const PASSCODE = process.env.TEST_CLIENT_PASSCODE || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type Turn = { role: "user" | "assistant"; content: string };

// ---------- utils ----------
function safeRead(filePath: string) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function trimTo(maxChars: number, text: string) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n...[trimmed for preview]..."
    : text;
}

// ---------- prompt builder ----------
function buildSystemPrompt(
  scenario: typeof forestAmbush,
  worldDoc: string,
  encounterDoc: string,
  conductorDoc: string,
  systemDoc: string,
  groundTruth: { kitNames: string[] }
) {
  const world = trimTo(12000, worldDoc);
  const enc = trimTo(8000, encounterDoc);
  const conductor = trimTo(6000, conductorDoc);
  const system = trimTo(9000, systemDoc);

  // Hidden: ground-truth contract and current kit (from FEEDS only).
  // This is DATA + DIRECTION, not lines to say.
  const groundTruthBlock = `
# Ground Truth Contract (hidden; do not expose)
- Feeds are the only current world state. Never infer items or capabilities from the scenario text.
- Inventory answers and option suggestions must be based only on the inventory/context/learned feeds for THIS turn.
- If an item/skill/spell is not present in the feeds, treat it as absent and prefer plausible present alternatives.
- Current Kit (from feeds): ${groundTruth.kitNames.length ? groundTruth.kitNames.join(", ") : "(none)"}
`.trim();

  // Tiny rule so the arbiter resolves numeric replies against its own options
  const choiceResolutionBlock = `
# Choice Resolution (hidden; do not expose)
If the player replies with a number (e.g., "1"), resolve it against the numbered options you just offered this turn.
Use feeds and any provided choiceHints to disambiguate item/verb. Feeds override scenario or prior assumptions.
`.trim();

  return `
You are the Moonfell encounter engine.

# Encounter Conductor Guide (authoritative: narration rules)
${conductor || "[No conductor doc]"}

# System Rules (authoritative: dice & mechanics)
${system || "[No system rules doc]"}

# Scenario (hidden referee brief)
Title: ${scenario.title}
Constraints:
- ${scenario.boundaries.join("\n- ")}
Referee Notes:
${scenario.refereeBrief}

# World Reference (excerpts)
${world || "[No world doc]"}

# Encounter Mechanics (excerpts)
${enc || "[No encounter doc]"}

${groundTruthBlock}

${choiceResolutionBlock}

# Output Contract
- Follow **PLAYER INTERFACE**, **NARRATION ETIQUETTE**, and **START THE SCENE** in the Conductor Guide.
- Always include **3–5 numbered, straightforward options**.
- Apply **System Rules** for initiative/dice; NPCs act proactively when triggers are met.
- No fourth wall. If the user types **"debug please"**, append one short \`[dbg: …]\` line.
- Stay within scenario boundaries; if the player tries to leave, redirect (limited preview).
`.trim();
}

// ---------- helper: soft choice hints for the arbiter (feeds-driven, not scripting) ----------
function findTagSlug(tags: string[], prefix: string): string | null {
  const t = tags.find((x) => x.startsWith(prefix));
  return t ? t.slice(prefix.length) : null;
}
function nameForSlug(tags: string[], slug: string | null): string | null {
  if (!slug) return null;
  const p = `pc:name:${slug}=`;
  const t = tags.find((x) => x.startsWith(p));
  return t ? t.slice(p.length) : null;
}

// ---------- handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    passcode,
    init,
    message,
    history = [],
    scenarioId,
    debug,
    debugRoll,
    debugFeeds, // <— NEW
  } = (req.body || {}) as {
    passcode?: string;
    init?: boolean;
    message?: string;
    history?: Turn[];
    scenarioId?: string;
    debug?: boolean;       // arbiter/observer debug block
    debugRoll?: boolean;   // roll math banner
    debugFeeds?: boolean;  // <— NEW: print feed tag wall when true
  };

  if (!PASSCODE || !OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server not configured (missing env vars)" });
  }
  if (!passcode || !passcode.trim() || passcode !== PASSCODE) {
    return res.status(401).json({ error: "Invalid passcode" });
  }

  // Load prompt docs
  const worldDoc = safeRead(path.join(process.cwd(), "src", "prompts", "world.md"));
  const encounterDoc = safeRead(path.join(process.cwd(), "src", "prompts", "encounter.md"));
  const conductorDoc = safeRead(path.join(process.cwd(), "src", "prompts", "conductor.md"));
  const systemDoc = safeRead(path.join(process.cwd(), "src", "prompts", "system.md"));

  // Choose scenario (extend later if multiple)
  const scenario = forestAmbush;

  // Init: set inventory from scenario.startKit and send scenario intro
  if (init) {
    try {
      const kit = Array.isArray((scenario as any).startKit) ? (scenario as any).startKit : [];

      const equipped = kit.filter((i: any) => i.where === "main" || i.where === "off" || i.where === "belt");
      const pack     = kit.filter((i: any) => i.where === "pack");
      const ground   = kit.filter((i: any) => i.where === "ground");

      // SSOT: write to STATE. Feeds will read this on subsequent turns.
      setStateInventory({
        equipped: equipped.map((i: any) => ({
          id: i.id,
          name: i.name,
          where: i.where,
          qty: i.qty ?? 1,
          tags: i.tags,
          lit: i.lit,
        })),
        pack: pack.map((i: any) => ({
          id: i.id,
          name: i.name,
          where: i.where,
          qty: i.qty ?? 1,
          tags: i.tags,
          lit: i.lit,
        })),
        ground: ground.map((i: any) => ({
          id: i.id,
          name: i.name,
          where: i.where,
          qty: i.qty ?? 1,
          tags: i.tags,
          lit: i.lit,
        })),
      });
    } catch {
      // never block init on failure
    }

    return res.status(200).json({
      intro: scenario.introForPlayer,
      scenario: scenario.id,
    });
  }

  const userMessage = (message || "").trim();
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  // ---------- Gather feeds (compact, prompt-safe) ----------
  let arbiterDecision: ArbiterDecision | null = null;

  const char = characterFeed();    // { name, stance, stats, activeConditions }
  const inv  = inventoryFeed();    // { tags: string[], list: {...} }
  const ctx  = contextFeed();      // { tags: string[] }
  const lrn  = learnedFeed();      // { tags: string[], list: {...} }

  // ---------- Soft choice hints (feeds → likely mapping) ----------
  const softOptionHints: string[] = (() => {
    const hints: string[] = [];

    // 1) Attack with main-hand melee if present
    if (inv.tags.includes("pc:weapon:melee")) {
      const mhSlug = findTagSlug(inv.tags, "pc:hand:main:");
      const mhName = nameForSlug(inv.tags, mhSlug) ||
        (inv.list.items.find((it: any) => it.kind === "melee")?.name ?? "melee weapon");
      hints.push(`1: attack with ${mhName} (melee)`);
    }

    // 2) Defend with shield if present
    if (inv.tags.includes("pc:shield")) {
      const shieldSlug = ((): string | null => {
        const nameTag = inv.tags.find((t) => t.startsWith("pc:name:") && t.includes("Buckler")) || null;
        return nameTag ? nameTag.slice("pc:name:".length).split("=")[0] : null;
      })();
      const shieldName = nameForSlug(inv.tags, shieldSlug) ||
        (inv.list.items.find((it: any) => it.kind === "shield")?.name ?? "shield");
      hints.push(`2: defend with ${shieldName} (defend)`);
    }

    // 3) Throwing axe if available
    const throwingAxeCount = (() => {
      const t = inv.tags.find((t) => t.startsWith("pc:throwing-axe:"));
      if (!t) return 0;
      const n = Number(t.split(":")[2]);
      return isNaN(n) ? 0 : n;
    })();
    if (throwingAxeCount > 0) {
      const taName = inv.list.items.find((it: any) => it.kind === "throwing-axe")?.name ?? "Throwing Axe";
      hints.push(`3: throw ${taName} (ranged/throw)`);
    }

    // 4) Social attempt is generally available
    hints.push("4: social attempt (negotiate/intimidate)");

    // 5) Use environment if affordances exist
    const hasEnvAff = ctx.tags.some((t) => t.startsWith("env:item:"));
    if (hasEnvAff) {
      hints.push("5: use environment (stones/branches/positioning)");
    }

    return hints;
  })();

  // ---------- Ask the Rolls DM with feeds (+ soft hints; compile-safe) ----------
  try {
    // Build payload with known shape; attach hints only if present to avoid TS complaining
    const arbiterPayload: any = {
      message: userMessage,
      sceneTags: ctx.tags,
      inventoryTags: inv.tags,
      learnedTags: lrn.tags,
      character: {
        name: char.name,
        stance: char.stance,
        stats: char.stats,
        activeConditions: char.activeConditions,
      },
    };
    if (softOptionHints.length) arbiterPayload.choiceHints = softOptionHints; // compile-safe

    arbiterDecision = await getRollDecision(arbiterPayload);

    // Apply immediate state changes proposed by the Rolls DM (if any)
    if (arbiterDecision && (arbiterDecision as any).apply_now) {
      applyDeltas(((arbiterDecision as any).apply_now as Delta[]) || []);
    }
  } catch {
    arbiterDecision = null; // never block the player flow if arbiter fails
  }

  // ---------- Roll Manager (mechanical roll only; narration unchanged) ----------
  let __rollLine = "";
  if (arbiterDecision && (arbiterDecision.kind === "fixed" || arbiterDecision.kind === "opposed")) {
    const out = resolveActionHit({
      decision: arbiterDecision,
      sceneTags: ctx.tags,
      inventoryTags: inv.tags,
      learnedTags: lrn.tags,
      seedParts: {
        scenarioId: scenario.id,
        turn: (Array.isArray(history) ? history.length : 0) + 1,
        userHash: "anon",
        extra: "hit",
      },
      debugRoll: !!debugRoll,
      defenderDefenseBonus: 2,
      attackerAbilityBonus: 0,
    });

    if (debugRoll && out.handled && out.debugLine) {
      __rollLine = out.debugLine;
    }
  }

  // ---- Build the system prompt (data + direction, no scripted lines) ----
  const invItemsForNames = (inv as any)?.list?.items ?? [];
  const currentKitNames: string[] = invItemsForNames
    .map((it: any) => (typeof it?.name === "string" ? it.name.trim() : ""))
    .filter((s: string) => !!s);

  let SYSTEM_PROMPT = buildSystemPrompt(
    scenario,
    worldDoc,
    encounterDoc,
    conductorDoc,
    systemDoc,
    { kitNames: currentKitNames }
  );

  // --- Options Guard: restrict suggested options to items/capabilities that actually exist now ---
  try {
    // Scene affordances (from env tags)
    const sceneItems: string[] = (ctx.tags || [])
      .filter((t) => t.startsWith("env:item:"))
      .map((t) => t.split(":")[2])
      .filter(Boolean);

    // Learned (names) from learned feed (optional)
    const learnedItems = (lrn as any)?.list?.items ?? [];
    const learnedNames: string[] = learnedItems
      .map((it: any) => (typeof it?.name === "string" ? it.name.trim() : ""))
      .filter((s: string) => !!s);

    const optionsGuard = `
# OPTIONS GUARD (hidden; do not expose)
When proposing the 3–5 numbered options, if an option would use an item, weapon, spell, skill, trait, or environmental object,
consult FEEDS and only use capabilities that exist right now.

- Player kit (inventory feed): ${currentKitNames.length ? currentKitNames.join(", ") : "none"}
- Scene affordances (context feed): ${sceneItems.length ? sceneItems.join(", ") : "none"}
- Learned capabilities (learned feed): ${learnedNames.length ? learnedNames.join(", ") : "none"}

Rules:
- **Feeds override everything** (scenario text, prior assumptions, earlier messages). If a capability or item is not present in feeds this turn, treat it as absent.
- Do not infer missing gear/spells/skills from the scenario or prior turns.
- Prefer distinct shapes (attack / defend / move / throw / speak / use-scene), within scenario boundaries.
`.trim();

    SYSTEM_PROMPT = `${SYSTEM_PROMPT}\n\n${optionsGuard}`;
  } catch {
    // If anything goes wrong, skip guard — never block play
  }

  // Build a specific prohibition message for this turn if auto-fail with needs-*
  const extraSystemGuards: Array<{ role: "system"; content: string }> = [];
  if (arbiterDecision && arbiterDecision.kind === "auto-fail") {
    const needs = (arbiterDecision.tags || [])
      .filter(t => typeof t === "string" && t.startsWith("needs-"))
      .map(t => t.slice("needs-".length).replace(/[-_]+/g, " ").trim())
      .filter(Boolean);

    if (needs.length) {
      const guard = `
# Scene Truths (strict for this turn; do not expose)
- The following items/capabilities are **NOT present** this turn: ${needs.map(n => `"${n}"`).join(", ")}.
- If the user asserts seeing any of them, treat it as misperception and reflect their absence in-world; prefer present alternatives where sensible.
`.trim();
      extraSystemGuards.push({ role: "system", content: guard });
    }
  }

  const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...extraSystemGuards,
    ...(Array.isArray(history) ? history.slice(-8) : []),
    { role: "user", content: userMessage },
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: msgs,
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(500).json({ error: "OpenAI request failed", detail: text.slice(0, 800) });
    }

    const data = JSON.parse(text);
    let reply: string = data?.choices?.[0]?.message?.content?.trim() || "(no reply)";

    // Promote narrator-mentioned items → env state (skip if already present)
    let __observerLine = "";
    try {
      const envDeltas = await proposeEnvDeltas({ narration: reply, sceneTags: ctx.tags });

      if (Array.isArray(envDeltas) && envDeltas.length) {
        const env = getEnvironment();
        const existing = new Set(env.items.map((it: any) => `${it.slug}@${it.where}`));

        const filtered = envDeltas.filter((d: any) => {
          if (d.type !== "environment" || d.op !== "add") return true;
          const key = `${d.slug}@${d.where}`;
          return !existing.has(key);
        });

        if (filtered.length) {
          applyDeltas(filtered as unknown as Delta[]);
          const added = filtered
            .filter((d: any) => d.type === "environment" && d.op === "add")
            .map((d: any) => `${d.slug}@${d.where} x${d.qty ?? 1}`);
          if (added.length) __observerLine = `[obs: added ${added.join(", ")}]`;
        }
      }
    } catch {}

    // ---------- Debug output ----------
    if (debug === true) {
      const preview = userMessage.replace(/\s+/g, " ").slice(0, 140);

      const decisionStr = (() => {
        if (!arbiterDecision) return "unavailable";
        switch (arbiterDecision.kind) {
          case "no-roll":
          case "auto-success":
          case "auto-fail":
            return `${arbiterDecision.kind} (${arbiterDecision.reason})${
              arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""
            }`;
          case "fixed":
            return `fixed ability=${arbiterDecision.ability}${
              arbiterDecision.dcHint ? ` dcHint=${arbiterDecision.dcHint}` : ""
            }${
              arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""
            }${
              arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""
            }${
              arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""
            }`;
          case "opposed":
            return `opposed atk=${arbiterDecision.attackerAbility} vs ${
              arbiterDecision.defender
            }${
              arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""
            }${
              arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""
            }${
              arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""
            }`;
          default:
            return "unknown";
        }
      })();

      // Feed wall only when debugFeeds is true
      let feedLine = "";
      if (debugFeeds === true) {
        const feedTags = [...ctx.tags, ...inv.tags, ...lrn.tags].slice(0, 120).join(", ");
        feedLine = `\n[feeds: ${feedTags} | stance=${char.stance} cond=${(char.activeConditions?.length ? char.activeConditions.join(",") : "none")}]`;
      }

      const arbLine = `[arb: input="${preview}" | ${decisionStr}]`;
      const observerBlock = __observerLine ? `\n${__observerLine}` : "";

      reply = `${arbLine}${feedLine}${observerBlock}\n\n${reply}`;
    }

    // Rolls debug — only when `debugRoll` is true
    if (debugRoll === true && __rollLine) {
      reply = `${__rollLine}\n${reply}`;
    }

    return res.status(200).json({ reply, scenario: scenario.id });
  } catch (e: any) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}