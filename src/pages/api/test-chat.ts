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
import { getContext } from "../../state/context";
import { runEncounterCycle } from "../../encounters/orchestrator";
import { learnedFeed } from "../../feeds/learned_feed";

// Entity AC calculation service
import { calculateEntityAC, getDefaultAC } from "../../services/entity_ac_service";
import { SkillModifierService } from "../../services/skill_modifier_service";
import { getCharacter } from "../../state/character";

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

function isNumericSelection(s: string) {
  const t = (s || "").trim();
  return /^(?:[1-5])(?:$|\s|[.,!?)\]])/.test(t);
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

  const groundTruthBlock = `
# Ground Truth Contract (hidden; do not expose)
- Feeds are the only current world state. Never infer items or capabilities from the scenario text.
- Inventory answers and option suggestions must be based only on the inventory/context/learned feeds for THIS turn.
- If an item/skill/spell is not present in the feeds, treat it as absent and prefer plausible present alternatives.
- Current Kit (from feeds): ${groundTruth.kitNames.length ? groundTruth.kitNames.join(", ") : "(none)"}
`.trim();

  const arbiterEtiquette = `
# Arbiter Output Etiquette (hidden; do not expose)
- Emit a single concise arbiter line per user input (the structured decision).
- Do not print extra meta lines like "resolve X action…"; let narration carry the prose.
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

${arbiterEtiquette}

# Output Contract
- Follow **PLAYER INTERFACE**, **NARRATION ETIQUETTE**, and **START THE SCENE** in the Conductor Guide.
- Always include **3–5 numbered, straightforward options**.
- Apply **System Rules** for initiative/dice; NPCs act proactively when triggers are met.
- No fourth wall. If the user types **"debug please"**, append one short \`[dbg: …]\` line.
- Stay within scenario boundaries; if the player tries to leave, redirect (limited preview).
`.trim();
}

// ---------- helper: feeds-driven option mapping ----------
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

type OptionMap = Record<"1" | "2" | "3" | "4" | "5", string | null>;

/**
 * Build a feeds-grounded map from 1..5 to intended option phrases.
 * These phrases are used as a fallback if the server cannot extract narrator options from history.
 */
function buildOptionMap(inv: ReturnType<typeof inventoryFeed>, ctx: ReturnType<typeof contextFeed>): OptionMap {
  const map: OptionMap = { "1": null, "2": null, "3": null, "4": null, "5": null };

  // 1) Attack with main-hand melee if present
  if (inv.tags.includes("pc:weapon:melee")) {
    const mhSlug = findTagSlug(inv.tags, "pc:hand:main:");
    const mhName = nameForSlug(inv.tags, mhSlug) ||
      (inv.list.items.find((it: any) => it.kind === "melee")?.name ?? "your blade");
    map["1"] = `attack with ${mhName}`;
  }

  // 2) Defend with shield if present
  if (inv.tags.includes("pc:shield")) {
    const shieldSlug = ((): string | null => {
      const nameTag = inv.tags.find((t) => t.startsWith("pc:name:") && /buckler/i.test(t)) || null;
      return nameTag ? nameTag.slice("pc:name:".length).split("=")[0] : null;
    })();
    const shieldName = nameForSlug(inv.tags, shieldSlug) ||
      (inv.list.items.find((it: any) => it.kind === "shield")?.name ?? "your shield");
    map["2"] = `defend with ${shieldName}`;
  }

  // 3) Throwing axe if available
  const throwingAxeCount = (() => {
    const t = inv.tags.find((t) => t.startsWith("pc:throwing-axe:"));
    if (!t) return 0;
    const n = Number(t.split(":")[2]);
    return isNaN(n) ? 0 : n;
  })();
  if (throwingAxeCount > 0) {
    const taName = inv.list.items.find((it: any) => it.kind === "throwing-axe")?.name ?? "your throwing axe";
    map["3"] = `throw ${taName}`;
  }

  // 4) Social attempt is generally available
  map["4"] = "attempt a social action (negotiate or intimidate)";

  // 5) Use environment if affordances exist
  const hasEnvAff = ctx.tags.some((t) => t.startsWith("env:item:"));
  if (hasEnvAff) {
    map["5"] = "use the environment (stones, branches, positioning)";
  }

  return map;
}

/* ---------- Arbiter normalizer ----------
   - Melee: If user intent is a melee-type attack and a main-hand weapon exists, enforce weapon classification.
   - Improvised: Do NOT override explicit improvised intent (e.g., "hit with branch/stone") when the env item exists.
   - Throw: If intent looks like a throw and throwing-axe exists, enforce thrown classification (AGI, context="thrown").
*/
function normalizeArbiterDecision(
  decision: any,
  inv: ReturnType<typeof inventoryFeed>,
  ctx: ReturnType<typeof contextFeed>,
  userIntentText: string
) {
  if (!decision) return decision;

  const intent = (userIntentText || "").toLowerCase();

  // ---- THROW branch
  const looksLikeThrow = /\bthrow\b|\btoss\b|\bhurl\b/.test(intent);
  if (looksLikeThrow) {
    const hasTA = inv.tags.some(t => /^pc:throwing-axe:\d+/.test(t));
    if (!hasTA) return decision;

    if (!Array.isArray(decision.tags)) decision.tags = [];
    decision.tags = decision.tags.filter((t: string) => t !== "improvised-attack");
    if (!decision.tags.includes("thrown-attack")) decision.tags.push("thrown-attack");
    if (!decision.tags.includes("weapon:throwing-axe")) decision.tags.push("weapon:throwing-axe");

    switch (decision.kind) {
      case "fixed":
        decision.ability = decision.ability || "AGI";
        decision.context = decision.context || "thrown";
        decision.reason = decision.reason || "Throwing axe at target";
        break;
      case "opposed":
      default:
        decision.kind = "opposed";
        decision.attackerAbility = decision.attackerAbility || "AGI";
        decision.defender = decision.defender || "bandit";
        decision.context = decision.context || "thrown";
        decision.reason = decision.reason || "Throwing axe at target";
        break;
    }
    return decision;
  }

  // ---- MELEE branch
  const meleeVerbs = /\battack\b|\bswing\b|\bstrike\b|\bstab\b|\bslash\b|\bhit\b/;
  const isAttackIntent = meleeVerbs.test(intent);
  if (!isAttackIntent) return decision;

  const improvisedWords: Array<{ word: RegExp; slug: string }> = [
    { word: /\bbranch(es)?\b/, slug: "branch" },
    { word: /\bstick\b/, slug: "branch" },
    { word: /\bstone(s)?\b/, slug: "stone" },
    { word: /\brock(s)?\b/, slug: "stone" },
    { word: /\blog\b/, slug: "log" },
  ];
  const ctxItems = new Set(
    (ctx.tags || [])
      .filter(t => t.startsWith("env:item:"))
      .map(t => t.split(":")[2])
  );
  const mentionsImprovisedAndExists = improvisedWords.some(({ word, slug }) => word.test(intent) && ctxItems.has(slug));
  if (mentionsImprovisedAndExists) return decision;

  const mhSlug = inv.tags.find(t => t.startsWith("pc:hand:main:"))?.slice("pc:hand:main:".length) || null;
  if (!mhSlug) return decision;

  const mhName =
    inv.tags.find(t => t.startsWith(`pc:name:${mhSlug}=`))?.split("=", 2)?.[1] ||
    inv.list.items.find((it: any) => it.kind === "melee")?.name ||
    mhSlug;

  if (!Array.isArray(decision.tags)) decision.tags = [];
  decision.tags = decision.tags.filter((t: string) => t !== "improvised-attack");
  if (!decision.tags.includes("melee-attack")) decision.tags.push("melee-attack");
  const weaponTag = `weapon:${mhSlug}`;
  if (!decision.tags.includes(weaponTag)) decision.tags.push(weaponTag);

  const ensureReason = () => {
    if (!decision.reason || typeof decision.reason !== "string" || !decision.reason.trim()) {
      decision.reason = `Attack with ${mhName}`;
    }
  };

  switch (decision.kind) {
    case "no-roll":
    case "auto-fail":
    case "auto-success":
      ensureReason();
      break;
    case "fixed":
      decision.ability = decision.ability || "STR";
      decision.context = decision.context || "melee";
      ensureReason();
      break;
    case "opposed":
    default:
      decision.kind = "opposed";
      decision.attackerAbility = decision.attackerAbility || "STR";
      decision.defender = decision.defender || "creature";
      decision.context = decision.context || "melee";
      ensureReason();
      break;
  }

  return decision;
}

/* ---------- Server-side numeric choice resolver ----------
   Parse the last assistant message for 1..5 options (tolerates "1.", "2)", "3 -", optional **bold**).
*/
function extractNumberedOptionsFromHistory(history: Turn[]): OptionMap {
  const map: OptionMap = { "1": null, "2": null, "3": null, "4": null, "5": null };
  if (!Array.isArray(history) || history.length === 0) return map;

  let lastAssistant: string | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant" && typeof history[i]?.content === "string") {
      lastAssistant = history[i].content;
      break;
    }
  }
  if (!lastAssistant) return map;

  const lines = lastAssistant.split(/\r?\n/);
  const optionLine = /^\s*([1-5])[\.\)\-:]\s+(\*{0,2})\s*(.+?)\s*(\*{0,2})\s*$/;

  for (const line of lines) {
    const m = line.match(optionLine);
    if (!m) continue;
    const num = m[1] as "1" | "2" | "3" | "4" | "5";
    let text = m[3].trim();
    if (map[num] == null) {
      map[num] = text;
    }
  }
  return map;
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
    debugFeeds,
  } = (req.body || {}) as {
    passcode?: string;
    init?: boolean;
    message?: string;
    history?: Turn[];
    scenarioId?: string;
    debug?: boolean;
    debugRoll?: boolean;
    debugFeeds?: boolean;
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

  const scenario = forestAmbush;

  // Init
  if (init) {
    try {
      const kit = Array.isArray((scenario as any).startKit) ? (scenario as any).startKit : [];
      const equipped = kit.filter((i: any) => i.where === "main" || i.where === "off" || i.where === "belt");
      const pack     = kit.filter((i: any) => i.where === "pack");
      const ground   = kit.filter((i: any) => i.where === "ground");

      setStateInventory({
        equipped: equipped.map((i: any) => ({ id: i.id, name: i.name, where: i.where, qty: i.qty ?? 1, tags: i.tags, lit: i.lit })),
        pack: pack.map((i: any) => ({ id: i.id, name: i.name, where: i.where, qty: i.qty ?? 1, tags: i.tags, lit: i.lit })),
        ground: ground.map((i: any) => ({ id: i.id, name: i.name, where: i.where, qty: i.qty ?? 1, tags: i.tags, lit: i.lit })),
      });
    } catch {}
    return res.status(200).json({ intro: scenario.introForPlayer, scenario: scenario.id });
  }

  const userMessageRaw = (message || "").trim();
  if (!userMessageRaw) return res.status(400).json({ error: "No message provided" });

  // Run encounter orchestrator BEFORE building feeds so SSOT reflects any spawns this turn
  try { await runEncounterCycle(); } catch {}

  // Feeds
  const char = characterFeed();
  const inv  = inventoryFeed();
  const ctx  = contextFeed();
  const lrn  = learnedFeed();

  // Choice mapping
  const serverOptionMap = extractNumberedOptionsFromHistory(history);
  const feedOptionMap = buildOptionMap(inv, ctx);
  const selectionKey = userMessageRaw.trim().charAt(0) as "1"|"2"|"3"|"4"|"5";
  const expandedMessage =
    isNumericSelection(userMessageRaw) && (serverOptionMap[selectionKey] || feedOptionMap[selectionKey])
      ? (serverOptionMap[selectionKey] || feedOptionMap[selectionKey])!
      : userMessageRaw;

  // Arbiter
  let arbiterDecision: ArbiterDecision | null = null;
  try {
    const arbiterPayload: any = {
      message: expandedMessage,
      sceneTags: ctx.tags,
      inventoryTags: inv.tags,
      learnedTags: lrn.tags,
      character: { name: char.name, stance: char.stance, stats: char.stats, activeConditions: char.activeConditions },
    };

    arbiterDecision = await getRollDecision(arbiterPayload);

    // Normalize (melee/throw) before any rolls/deltas
    arbiterDecision = normalizeArbiterDecision(arbiterDecision, inv, ctx, expandedMessage);

    // OPTIONAL: on explicit draw, reflect equip in State via deltas (belt → main; else add@main)
    try {
      const intent = expandedMessage.toLowerCase();
      const draws = /\bdraw\b.*\b(sword|longsword|blade)\b/.test(intent);
      const mhSlug = inv.tags.find(t => t.startsWith("pc:hand:main:"))?.slice("pc:hand:main:".length);
      const longTag = inv.tags.find(t => /^pc:item:.*longsword/.test(t));
      const longSlug = longTag ? longTag.split(":")[2] : null;

      if (draws && longSlug && mhSlug !== longSlug) {
        const deltas: Delta[] = [
          { type: "inventory", op: "move", item: longSlug, from: "belt", to: "main", qty: 1 } as Delta,
        ];
        // Try move first (belt → main); if it fails, add@main as fallback
        const result = applyDeltas(deltas);
        if (result.errors.length) {
          applyDeltas([{ type: "inventory", op: "add", item: longSlug, where: "main", qty: 1, name: longSlug } as Delta]);
        }
      }
    } catch {}

    if (arbiterDecision && (arbiterDecision as any).apply_now) {
      applyDeltas(((arbiterDecision as any).apply_now as Delta[]) || []);
    }
  } catch {
    arbiterDecision = null;
  }

  // Roll Manager
  let __rollLine = "";
  if (arbiterDecision && (arbiterDecision.kind === "fixed" || arbiterDecision.kind === "opposed")) {
    // Calculate entity AC if this is an opposed roll against a creature or humanoid
    let entityAC: number | undefined;
    let skillModifierInfo: string | undefined;
    
    if (arbiterDecision.kind === "opposed") {
      // Get character's skill modifier state
      const char = getCharacter();
      const skillService = new SkillModifierService(char.skillModifiers);
      
      // Determine trigger type based on attack type
      const triggerType = arbiterDecision.attackerAbility === "AGI" ? "when_attacked_ranged" : "when_attacked_melee";
      
      const acResult = calculateEntityAC(ctx.tags, skillService, triggerType);
      if (acResult.success) {
        entityAC = acResult.armorClass;
        
        // Check if skill modifier was triggered
        if (acResult.skillModifiers?.acBonus && acResult.skillModifiers.acBonus > 0) {
          const triggerResult = skillService.checkTrigger(triggerType, (Array.isArray(history) ? history.length : 0) + 1);
          if (triggerResult.triggered) {
            skillModifierInfo = `${triggerResult.skillName} triggered (+${acResult.skillModifiers.acBonus} AC)`;
          }
        }
      } else {
        // Fallback to default AC if calculation fails
        entityAC = getDefaultAC();
        if (debugRoll) {
          console.warn(`AC calculation failed: ${acResult.error}`);
        }
      }
    }

    const out = resolveActionHit({
      decision: arbiterDecision,
      sceneTags: ctx.tags,
      inventoryTags: inv.tags,
      learnedTags: lrn.tags,
      seedParts: { scenarioId: scenario.id, turn: (Array.isArray(history) ? history.length : 0) + 1, userHash: "anon", extra: "hit" },
      debugRoll: !!debugRoll,
      defenderDefenseBonus: 2,
      attackerAbilityBonus: 0,
      armorClass: entityAC, // Pass calculated AC
    });
    if (debugRoll && out.handled && out.debugLine) {
      __rollLine = out.debugLine;
      if (skillModifierInfo) {
        __rollLine += `\n  ${skillModifierInfo}`;
      }
    }
  }

  // Prompt (with guard)
  const invItemsForNames = (inv as any)?.list?.items ?? [];
  const currentKitNames: string[] = invItemsForNames.map((it: any) => (typeof it?.name === "string" ? it.name.trim() : "")).filter(Boolean);

  let SYSTEM_PROMPT = buildSystemPrompt(scenario, worldDoc, encounterDoc, conductorDoc, systemDoc, { kitNames: currentKitNames });

  try {
    const sceneItems: string[] = (ctx.tags || []).filter(t => t.startsWith("env:item:")).map(t => t.split(":")[2]).filter(Boolean);
    const learnedItems = (lrn as any)?.list?.items ?? [];
    const learnedNames: string[] = learnedItems.map((it: any) => (typeof it?.name === "string" ? it.name.trim() : "")).filter(Boolean);
    const creatureSummaries: string[] = (ctx.tags || [])
      .filter(t => t.startsWith("creature:"))
      .map(t => t.split(":").slice(1).join(":"))
      .filter(Boolean);

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

    const creaturesGuard = `
# CREATURES/ACTORS GUARD (hidden; do not expose)
- Only describe creatures/humanoids that exist in FEEDS right now.
- Do NOT introduce new entities, factions, or reinforcements unless FEEDS include them.
- If none are present, avoid implying visible creatures; suggest non-combat actions instead.
- If the player tries to "spawn" or "attract" foes, acknowledge intent but reflect current FEEDS.
- Nearby (from FEEDS): ${creatureSummaries.length ? creatureSummaries.join("; ") : "none"}
`.trim();

    SYSTEM_PROMPT = `${SYSTEM_PROMPT}\n\n${optionsGuard}\n\n${creaturesGuard}`;
  } catch {}

  const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(Array.isArray(history) ? history.slice(-8) : []),
    { role: "user", content: userMessageRaw },
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.8, max_tokens: 500 }),
    });

    const text = await r.text();
    if (!r.ok) return res.status(500).json({ error: "OpenAI request failed", detail: text.slice(0, 800) });

    const data = JSON.parse(text);
    let reply: string = data?.choices?.[0]?.message?.content?.trim() || "(no reply)";

    // Observer → env deltas (dedup)
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
          const added = filtered.filter((d: any) => d.type === "environment" && d.op === "add")
                               .map((d: any) => `${d.slug}@${d.where} x${d.qty ?? 1}`);
          if (added.length) __observerLine = `[obs: added ${added.join(", ")}]`;
        }
      }
    } catch {}

    // Debug
    if (debug === true) {
      const preview = userMessageRaw.replace(/\s+/g, " ").slice(0, 140);

      const decisionStr = (() => {
        if (!arbiterDecision) return "unavailable";
        switch (arbiterDecision.kind) {
          case "no-roll":
          case "auto-success":
          case "auto-fail":
            return `${arbiterDecision.kind} (${arbiterDecision.reason})${arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""}`;
          case "fixed":
            return `fixed ability=${arbiterDecision.ability}${arbiterDecision.dcHint ? ` dcHint=${arbiterDecision.dcHint}` : ""}${arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""}${arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""}${arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""}`;
          case "opposed":
            return `opposed atk=${arbiterDecision.attackerAbility} vs ${arbiterDecision.defender}${arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""}${arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""}${arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""}`;
          default:
            return "unknown";
        }
      })();

      let feedLine = "";
      if (debugFeeds === true) {
        const feedTags = [...ctx.tags, ...inv.tags, ...lrn.tags].slice(0, 120).join(", ");
        const cond = (char.activeConditions?.length ? char.activeConditions.join(",") : "none");
        feedLine = `\n[feeds: ${feedTags} | stance=${char.stance} cond=${cond}]`;
      }

      const observerBlock = __observerLine ? `\n${__observerLine}` : "";
      reply = `[arb: input="${preview}" | ${decisionStr}]${feedLine}${observerBlock}\n\n${reply}`;
    }

    if (debugRoll === true && __rollLine) {
      reply = `${__rollLine}\n${reply}`;
    }

    // Thread through a basic nearby list from state context so the client can render roster
    const ctxNow = getContext();
    const nearby = Array.isArray(ctxNow?.nearby) ? ctxNow.nearby : [];
    return res.status(200).json({ reply, scenario: scenario.id, nearby });
  } catch (e: any) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}