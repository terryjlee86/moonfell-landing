// src/services/rolls_dm.ts
//
// TRIMMED Rolls DM (feasibility-only):
// - Binary gates: demo rail (leaving), known spells, bow/crossbow/throwable, rope, light
// - Social-influence tagging -> opposed(CHA vs creature)
// - Otherwise: prefer no-roll for ambience; fixed(AGI) for simple physical actions
// - Minimal LLM prompt to classify intent; no giant hard-coded branches

import fs from "fs";
import path from "path";

export type ArbiterInputCharacter = {
  name?: string;
  stance?: "neutral" | "braced" | "sprinting" | string;
  stats?: { STR?: number; AGI?: number; END?: number; INT?: number; WIL?: number; CHA?: number };
  activeConditions?: string[];
};

export type ArbiterInput = {
  message: string;
  sceneTags?: string[];      // e.g. ["rail:demo-area-only", "creature:goblin:hostile:6m"]
  inventoryTags?: string[];  // e.g. ["pc:bow","pc:throwable:1","pc:light:unlit","pc:rope"]
  learnedTags?: string[];    // e.g. ["pc:skill:social","pc:spell:sparkLight"]
  character?: ArbiterInputCharacter;
};

export type ArbiterDecision =
  | { kind: "no-roll"; reason: string; tags?: string[] }
  | { kind: "auto-success"; reason: string; tags?: string[] }
  | { kind: "auto-fail"; reason: string; tags?: string[] }
  | { kind: "fixed"; ability: string; dcHint?: string; context?: string; reason?: string; tags?: string[] }
  | { kind: "opposed"; attackerAbility: string; defender: string; context?: string; reason?: string; tags?: string[] };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---------- utils ----------
function loadRollRules(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src", "prompts", "rolls", "rolls_rules.md"), "utf8");
  } catch {
    return "[No rolls_rules.md found]";
  }
}
function clamp(text: string, max = 6000) { return !text ? "" : text.length > max ? text.slice(0, max) + "\n\n...[trimmed]..." : text; }
function fallback(reason: string): ArbiterDecision { return { kind: "no-roll", reason, tags: ["arbiter-fallback"] }; }
const hasTag = (tags: string[], p: string) => tags.some((t) => t === p || t.startsWith(p + ":"));
const tagValue = (tags: string[], prefix: string): string | undefined =>
  tags.find((t) => t.startsWith(prefix + ":"))?.split(":").slice(1).join(":");

// ---------- tiny heuristics (kept minimal) ----------
const RANGED_VERBS = /\b(shoot|fire|aim|nock|loose)\b/i;
const THROW_VERBS  = /\b(throw|toss|hurl|lob)\b/i;
const BOW_WORDS    = /\b(bow|crossbow|arrow|bolt)\b/i;
const LIGHT_INTENT = /\b(light|ignite|spark)\b.*\b(torch|lantern)\b/i;
const ROPE_INTENT  = /\b(tie|tether|secure|lasso|lower)\b.*\b(rope)\b/i;
const LEAVE_DEMO   = /\b(leave|exit|travel|go to|head to|make for)\b/i;

function wantsRanged(msg: string)     { return RANGED_VERBS.test(msg); }
function mentionsBow(msg: string)     { return BOW_WORDS.test(msg); }
function wantsThrow(msg: string)      { return THROW_VERBS.test(msg); }
function wantsLightAction(msg: string){ return LIGHT_INTENT.test(msg); }
function wantsRopeUse(msg: string)    { return ROPE_INTENT.test(msg); }
function wantsToLeaveDemo(msg: string){ return LEAVE_DEMO.test(msg); }

// --- spell parsing (very small) ---
function extractRequestedSpells(message: string): string[] {
  const m = message.toLowerCase();
  const found = new Set<string>();
  const verbs = "(cast|use|conjure|invoke|unleash|channel|summon)";
  const afterVerb = new RegExp(`\\b${verbs}\\b\\s+(?:the\\s+)?([a-z][a-z\\-']{2,24})\\b`, "gi");
  const xSpell   = /\b([a-z][a-z\-']{2,24})\s+spell\b/gi;
  let hit: RegExpExecArray | null;
  while ((hit = afterVerb.exec(m))) found.add(hit[1]);
  while ((hit = xSpell.exec(m)))   found.add(hit[1]);
  if (/\bfire\s*ball\b/i.test(message)) found.add("fireball");
  if (/\bfirebolt\b/i.test(message))    found.add("firebolt");
  if (/\bspark\s*light\b/i.test(message)) found.add("sparkLight");
  return Array.from(found);
}
function knowsSpell(learnedTags: string[] | undefined, spellIdLC: string): boolean {
  if (!learnedTags || learnedTags.length === 0) return false;
  return learnedTags.some((t) => t.startsWith("pc:spell:") && t.slice("pc:spell:".length).toLowerCase() === spellIdLC.toLowerCase());
}

// --- coerce tool output ---
function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.kind !== "string") return null;
  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string") : undefined;
  switch (obj.kind) {
    case "no-roll":
    case "auto-success":
    case "auto-fail":
      return typeof obj.reason === "string" && obj.reason.length > 0 ? { kind: obj.kind, reason: obj.reason, tags } : null;
    case "fixed":
      if (typeof obj.ability === "string") {
        return {
          kind: "fixed",
          ability: obj.ability,
          dcHint: typeof obj.dcHint === "string" ? obj.dcHint : undefined,
          context: typeof obj.context === "string" ? obj.context : undefined,
          reason: typeof obj.reason === "string" ? obj.reason : undefined,
          tags,
        };
      }
      return null;
    case "opposed":
      if (typeof obj.attackerAbility === "string" && typeof obj.defender === "string") {
        return {
          kind: "opposed",
          attackerAbility: obj.attackerAbility,
          defender: obj.defender,
          context: typeof obj.context === "string" ? obj.context : undefined,
          reason: typeof obj.reason === "string" ? obj.reason : undefined,
          tags,
        };
      }
      return null;
    default:
      return null;
  }
}

// ---------- main ----------
export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  const rules = loadRollRules();
  const msg = (input.message || "").trim();
  if (!msg) return fallback("No message");

  const mergedTags: string[] = [
    ...(input.sceneTags ?? []),
    ...(input.inventoryTags ?? []),
    ...(input.learnedTags ?? []),
  ].slice(0, 200);

  // Rails: only block if explicitly trying to leave
  if (hasTag(mergedTags, "rail:demo-area-only") && wantsToLeaveDemo(msg)) {
    return { kind: "auto-fail", reason: "Demo boundary: you can’t leave the preview area.", tags: ["rail-block"] };
  }

  // Spells: deterministic unknown check
  const reqSpells = extractRequestedSpells(msg);
  if (reqSpells.length) {
    const unknown = reqSpells.find((s) => !knowsSpell(input.learnedTags, s));
    if (unknown) {
      return { kind: "auto-fail", reason: `You do not know the spell '${unknown}'.`, tags: [`needs-spell:${unknown}`] };
    }
  }

  // Binary capability gates (kept tiny)
  const hasBow       = hasTag(mergedTags, "pc:bow");
  const hasCrossbow  = hasTag(mergedTags, "pc:crossbow");
  const throwableN   = parseInt(tagValue(mergedTags, "pc:throwable") || "0", 10);
  const lightState   = tagValue(mergedTags, "pc:light"); // "lit" | "unlit" | "none"
  const hasRope      = hasTag(mergedTags, "pc:rope");

  // If user explicitly mentions bow/crossbow but none present → hard fail
  if (mentionsBow(msg) && !hasBow && !hasCrossbow) {
    return { kind: "auto-fail", reason: "You don’t have a bow or crossbow.", tags: ["needs-bow"] };
  }

  // Ranged generic intent (“shoot”) with no ranged capacity at all
  if (wantsRanged(msg) && !mentionsBow(msg) && !hasBow && !hasCrossbow && throwableN <= 0) {
    return { kind: "auto-fail", reason: "No ranged option available.", tags: ["needs-ranged-weapon"] };
  }

  // Throw intent but nothing throwable
  if (wantsThrow(msg) && throwableN <= 0) {
    return { kind: "auto-fail", reason: "No throwable items available.", tags: ["needs-throwable"] };
  }

  // Rope use with no rope
  if (wantsRopeUse(msg) && !hasRope) {
    return { kind: "auto-fail", reason: "You have no rope to do that.", tags: ["needs-rope"] };
  }

  // Light action with no light source
  if (wantsLightAction(msg) && (!lightState || lightState === "none")) {
    return { kind: "auto-fail", reason: "No torch or lantern to light.", tags: ["needs-light-source"] };
  }
  // If they *do* have a light source and are trying to light it, call that trivial
  if (wantsLightAction(msg) && lightState && lightState !== "none") {
    return { kind: "auto-success", reason: "Lighting a carried torch/lantern is trivial in calm conditions.", tags: ["light-action"] };
  }

  // ---------- Minimal LLM pass for intent classification ----------
  // Keeps narration flexible without hard-coding lists.
  if (!OPENAI_API_KEY) {
    // No key → heuristic fallback:
    if (/\b(calm|lull|charm|soothe|frighten|intimidate|persuade|lure|mesmeri[sz]e|distract|confuse|taunt|mislead)\b/i.test(msg)
        && /\b(creature|goblin|mirefold|beast|guard|lookout|enemy|it|them|him|her)\b/i.test(msg)) {
      return { kind: "opposed", attackerAbility: "CHA", defender: "creature", reason: "Social influence attempt.", tags: ["social-influence"] };
    }
    // If they intend physical ranged or throw and have capacity → fixed(AGI)
    if ((wantsRanged(msg) && (hasBow || hasCrossbow || throwableN > 0)) || (wantsThrow(msg) && throwableN > 0)) {
      return { kind: "fixed", ability: "AGI", reason: "Ranged/throw action is feasible; resolve with a roll.", tags: ["ranged-or-throw"] };
    }
    // Otherwise ambient
    return { kind: "no-roll", reason: "Ambient or descriptive action; no roll required.", tags: ["ambient-action"] };
  }

  const systemPrompt = `
You are the Rolls DM. Keep it minimal and fiction-first.

Your job:
- Classify the player's input as one of: no-roll, auto-success, auto-fail, fixed, opposed.
- Enforce *only binary feasibility*: demo rail leaving, unknown spells, must-have gear (bow/crossbow/throwable, rope, light).
- Leave soft modifiers (blinded, penalties, exact DCs) to another system.
- Use opposed(CHA vs creature) when the text clearly tries to **influence** a creature/NPC (calm, lull, charm, intimidate, persuade, distract, etc.).
- Prefer no-roll for pure ambience (look around, hum, casual movement).
Return the decision by calling the tool function; keep reason short; add 1–3 helpful tags (e.g., "ambient-action", "social-influence", "needs-bow").
Policy (reference):
${clamp(rules)}
`.trim();

  const tools = [
    {
      type: "function",
      function: {
        name: "decide_roll",
        description: "Return the roll decision for the player's input.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["no-roll", "auto-success", "auto-fail", "fixed", "opposed"] },
            reason: { type: "string" },
            tags: { type: "array", items: { type: "string" }, nullable: true },
            ability: { type: "string", enum: ["STR", "AGI", "END", "INT", "WIL", "CHA"] },
            dcHint: { type: "string", enum: ["easy", "standard", "hard", "heroic"], nullable: true },
            context: { type: "string", nullable: true },
            attackerAbility: { type: "string", enum: ["STR", "AGI", "END", "INT", "WIL", "CHA"] },
            defender: { type: "string", enum: ["creature", "environment", "player"] },
          },
          required: ["kind", "reason"],
          additionalProperties: false,
        },
      },
    },
  ];

  const userPayload = {
    message: msg,
    tags: mergedTags,
    // Hints for the model (non-binding; keeps it flexible)
    hints: {
      hasBow, hasCrossbow, throwableN, hasRope, lightState,
      influenceVerbs: "(calm,lull,charm,soothe,frighten,intimidate,persuade,lure,mesmerise,distract,confuse,taunt,mislead)",
    },
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 160,
        tools,
        tool_choice: { type: "function", function: { name: "decide_roll" } },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Decide roll per policy; respond only by calling decide_roll.\n" + JSON.stringify(userPayload) },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) return fallback(`Arbiter error (${r.status})`);
    const data = JSON.parse(text);
    const tc = data?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(tc) || tc.length === 0) return fallback("Arbiter fallback (no tool call)");
    if (tc[0]?.function?.name !== "decide_roll") return fallback("Arbiter fallback (wrong tool)");

    let args: any = {};
    try { args = JSON.parse(tc[0].function.arguments || "{}"); }
    catch { return fallback("Arbiter fallback (bad tool args)"); }

    let decision = coerceDecision(args) ?? fallback("Arbiter fallback (schema mismatch)");

    // Post-LLM guardrails (very small):
    // If model says auto-fail but our binary gates say it *is* feasible, downgrade to fixed(AGI)
    if (decision.kind === "auto-fail") {
      if ((wantsRanged(msg) && (hasBow || hasCrossbow || throwableN > 0)) ||
          (wantsThrow(msg) && throwableN > 0) ||
          (wantsRopeUse(msg) && hasRope) ||
          (wantsLightAction(msg) && lightState && lightState !== "none")) {
        decision = { kind: "fixed", ability: "AGI", reason: "Feasible action; resolve with a roll.", tags: ["guard:override-auto-fail"] };
      }
    }

    return decision;
  } catch {
    // LLM failed → heuristic fallback
    if (/\b(calm|lull|charm|soothe|frighten|intimidate|persuade|lure|mesmeri[sz]e|distract|confuse|taunt|mislead)\b/i.test(msg)
        && /\b(creature|goblin|mirefold|beast|guard|lookout|enemy|it|them|him|her)\b/i.test(msg)) {
      return { kind: "opposed", attackerAbility: "CHA", defender: "creature", reason: "Social influence attempt.", tags: ["social-influence"] };
    }
    if ((wantsRanged(msg) && (hasBow || hasCrossbow || throwableN > 0)) || (wantsThrow(msg) && throwableN > 0)) {
      return { kind: "fixed", ability: "AGI", reason: "Ranged/throw action is feasible; resolve with a roll.", tags: ["ranged-or-throw"] };
    }
    return { kind: "no-roll", reason: "Ambient or descriptive action; no roll required.", tags: ["ambient-action"] };
  }
}