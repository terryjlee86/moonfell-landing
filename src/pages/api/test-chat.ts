// src/pages/api/test-chat.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import forestAmbush from "../../prompts/scenarios/forest_ambush";
import { getRollDecision, ArbiterDecision } from "../../services/rolls_dm";

// Feeds (safe, compact serializers)
import { characterFeed } from "../../feeds/character_feed";
import { inventoryFeed } from "../../feeds/inventory_feed";
import { contextFeed } from "../../feeds/context_feed";
import { learnedFeed } from "../../feeds/learned_feed";

// Delta applier (applies Rolls DM apply_now / outcome deltas)
import { applyDeltas, type Delta } from "../../services/delta_applier";

// Observer (promote plausible items from narration)
import { proposeEnvDeltas } from "../../services/narration_observer";

// NEW: read current environment to avoid re-adding items that already exist
import { getEnvironment } from "../../state/environment";

// NEW: roll manager (wire-in only for fixed/opposed; narration unchanged)
import { resolveActionHit } from "../../services/roll_manager";

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
  systemDoc: string
) {
  const world = trimTo(12000, worldDoc);
  const enc = trimTo(8000, encounterDoc);
  const conductor = trimTo(6000, conductorDoc);
  const system = trimTo(9000, systemDoc);

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

# Output Contract
- Follow **PLAYER INTERFACE**, **NARRATION ETIQUETTE**, and **START THE SCENE** in the Conductor Guide.
- Always include **3–5 numbered, straightforward options**.
- Apply **System Rules** for initiative/dice; NPCs act proactively when triggers are met.
- No fourth wall. If the user types **"debug please"**, append one short \`[dbg: …]\` line.
- Stay within scenario boundaries; if the player tries to leave, redirect (limited preview).
`.trim();
}

// ---------- handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { passcode, init, message, history = [], scenarioId, debug, debugRoll } = (req.body || {}) as {
    passcode?: string;
    init?: boolean;
    message?: string;
    history?: Turn[];
    scenarioId?: string;
    debug?: boolean;      // existing UI toggle (arb/feeds/obs)
    debugRoll?: boolean;  // NEW: separate toggle for roll math debug
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

  // Init: send scenario intro without spending tokens
  if (init) {
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

  // Ask the Rolls DM with feeds
  try {
    arbiterDecision = await getRollDecision({
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
    });

    // Apply immediate state changes proposed by the Rolls DM (if any)
    if (arbiterDecision && (arbiterDecision as any).apply_now) {
      applyDeltas(((arbiterDecision as any).apply_now as Delta[]) || []);
    }
  } catch {
    arbiterDecision = null; // never block the player flow if arbiter fails
  }

  // NEW — Run Roll Manager (mechanical roll only; narration unchanged)
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

  // Build the system prompt
  let SYSTEM_PROMPT = buildSystemPrompt(
    scenario,
    worldDoc,
    encounterDoc,
    conductorDoc,
    systemDoc
  );

  // --- Options Guard: restrict suggested options to items/capabilities that actually exist now ---
  try {
    // 1) Player kit names (from inventory feed)
    const invItems = (inv as any)?.list?.items ?? [];
    const kitNames: string[] = invItems
      .map((it: any) => (typeof it?.name === "string" ? it.name.trim() : ""))
      .filter((s: string) => !!s);

    // 2) Scene affordances (from env tags)
    const sceneItems: string[] = (ctx.tags || [])
      .filter((t) => t.startsWith("env:item:"))
      .map((t) => t.split(":")[2])
      .filter(Boolean);

    // 3) Soft guard (hidden) — narrator uses only what’s present when offering numbered options
    const optionsGuard = `
# OPTIONS GUARD (hidden; do not expose)
When offering the 3–5 numbered options, only suggest actions using items/capabilities that are actually present now.
- Player kit (by name): ${kitNames.length ? kitNames.join(", ") : "none"}
- Scene affordances: ${sceneItems.length ? sceneItems.join(", ") : "none"}

Rules:
- Do NOT suggest actions that rely on unavailable gear (e.g., "attack with dagger" if no dagger in kit).
- Prefer functional categories when appropriate (e.g., "attack with your blade", "throw a stone") that map to present items.
- Keep 3–5 options, distinct in shape (attack / defend / move / throw / speak / use-scene).
- Remain within scenario boundaries; no rail-breaking options.
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
- The following items are **NOT present** this turn: ${needs.map(n => `"${n}"`).join(", ")}.
- If the user claims to see any of them, treat it as **misperception**: narrate their **absence** in-world (briefly) and propose plausible alternatives (e.g., stones, branches).
- Do **NOT** depict the forbidden items in any way this turn.
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
        const existing = new Set(env.items.map(it => `${it.slug}@${it.where}`));

        const filtered = envDeltas.filter(d => {
          if (d.type !== "environment" || d.op !== "add") return true;
          const key = `${(d as any).slug}@${(d as any).where}`;
          return !existing.has(key);
        });

        if (filtered.length) {
          applyDeltas(filtered as unknown as Delta[]);
          const added = filtered
            .filter(d => d.type === "environment" && d.op === "add")
            .map(d => `${(d as any).slug}@${(d as any).where} x${(d as any).qty ?? 1}`);
          if (added.length) __observerLine = `[obs: added ${added.join(", ")}]`;
        }
      }
    } catch {}

    // ---------- Debug output ----------
    // 1) General debug (arbiter + feeds + observer) — only when `debug` is true
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

      const feedTags = [...ctx.tags, ...inv.tags, ...lrn.tags].slice(0, 24).join(", ");
      const cond = (char.activeConditions?.length ? char.activeConditions.join(",") : "none");

      const dbgBlock =
        `[arb: input="${preview}" | ${decisionStr}]\n` +
        `[feeds: ${feedTags} | stance=${char.stance} cond=${cond}]`;

      const observerBlock = __observerLine ? `${__observerLine}\n` : "";

      reply = `${dbgBlock}\n${observerBlock}\n${reply}`;
    }

    // 2) Rolls debug — only when `debugRoll` is true
    if (debugRoll === true && __rollLine) {
      reply = `${__rollLine}\n${reply}`;
    }

    return res.status(200).json({ reply, scenario: scenario.id });
  } catch (e: any) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}