// src/services/rolls_dm.ts
//
// Rolls DM: decides if a player's input should trigger a roll,
// returning a structured decision + plain-language reason + optional tags.
// Scope: intent + binary feasibility (must-have items & known spells).
// Soft modifiers (e.g., blinded penalties) are NOT handled here.

import fs from "fs";
import path from "path";

export type ArbiterInputCharacter = {
  name?: string;
  stance?: "neutral" | "braced" | "sprinting" | string;
  stats?: { STR?: number; AGI?: number; END?: number; INT?: number; WIL?: number; CHA?: number };
  activeConditions?: string[]; // e.g., ["wounded","blinded"]
};

export type ArbiterInput = {
  message: string;
  sceneTags?: string[];          // e.g., ["rail:demo-area-only","creature:mirefold:wary:6m"]
  inventoryTags?: string[];      // e.g., ["pc:shield","pc:ranged","pc:light:unlit","pc:rope","pc:throwable:1"]
  learnedTags?: string[];        // e.g., ["pc:skill:stealth","pc:spell:sootheTone"]
  character?: ArbiterInputCharacter;
};

export type ArbiterDecision =
  | { kind: "no-roll"; reason: string; tags?: string[] }
  | { kind: "auto-success"; reason: string; tags?: string[] }
  | { kind: "auto-fail"; reason: string; tags?: string[] }
  | {
      kind: "fixed";
      ability: string;
      dcHint?: string;
      context?: string;
      reason?: string;
      tags?: string[];
    }
  | {
      kind: "opposed";
      attackerAbility: string;
      defender: string;
      context?: string;
      reason?: string;
      tags?: string[];
    };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---------- utils ----------
function loadRollRules(): string {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "src", "prompts", "rolls", "rolls_rules.md"),
      "utf8"
    );
  } catch {
    return "[No rolls_rules.md found]";
  }
}

function clamp(text: string, max = 6000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n\n...[trimmed]..." : text;
}

function fallback(reason: string): ArbiterDecision {
  return { kind: "no-roll", reason, tags: ["arbiter-fallback"] };
}

function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.kind !== "string") return null;
  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string") : undefined;

  switch (obj.kind) {
    case "no-roll":
    case "auto-success":
    case "auto-fail":
      if (typeof obj.reason === "string" && obj.reason.length > 0) {
        return { kind: obj.kind, reason: obj.reason, tags };
      }
      return null;
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

// ---------- helpers (deterministic, binary) ----------
const hasTag = (tags: string[], p: string) => tags.some((t) => t === p || t.startsWith(p + ":"));
const tagValue = (tags: string[], prefix: string): string | undefined =>
  tags.find((t) => t.startsWith(prefix + ":"))?.split(":").slice(1).join(":");

function wantsRanged(message: string) {
  return /\b(shoot|nock|loose|fire|arrow|bow|crossbow)\b/i.test(message);
}
function wantsThrow(message: string) {
  return /\b(throw|toss|hurl|lob)\b/i.test(message);
}
function wantsRopeUse(message: string) {
  return /\b(tie|tether|secure|lasso|lower\s+.*\bwith\b\s+rope)\b/i.test(message);
}
function wantsLightAction(message: string) {
  // hard binary: "light/ignite torch/lantern"
  return /\b(light|ignite|spark)\b.*\b(torch|lantern)\b/i.test(message);
}
function wantsToLeaveDemo(message: string) {
  // explicit exit/travel attempts only
  return /\b(leave|exit|travel|go to|head to|make for)\b/i.test(message);
}

// Extract candidate spell names from message (very lightweight):
function extractRequestedSpells(message: string): string[] {
  const m = message.toLowerCase();
  const found = new Set<string>();

  // Patterns: "cast X", "use X", "conjure X", "invoke X", "X spell"
  const verbs = "(cast|use|conjure|invoke|unleash|channel|summon)";
  const afterVerb = new RegExp(`\\b${verbs}\\b\\s+the\\s+([a-z][a-z\\-']{2,24})\\b`, "gi");
  const afterVerb2 = new RegExp(`\\b${verbs}\\b\\s+([a-z][a-z\\-']{2,24})\\b`, "gi");
  const xSpell = /\b([a-z][a-z\-']{2,24})\s+spell\b/gi;

  let m1: RegExpExecArray | null;
  while ((m1 = afterVerb.exec(m))) found.add(m1[1]);
  while ((m1 = afterVerb2.exec(m))) found.add(m1[1]);
  while ((m1 = xSpell.exec(m))) found.add(m1[1]);

  // A couple of common aliases people type:
  if (/\bfire\s*ball\b/i.test(message)) found.add("fireball");
  if (/\bfirebolt\b/i.test(message)) found.add("firebolt");
  if (/\bspark\s*light\b/i.test(message)) found.add("sparklight");

  return Array.from(found);
}

function knowsSpell(learnedTags: string[] | undefined, spellIdLC: string): boolean {
  if (!learnedTags || learnedTags.length === 0) return false;
  // learned tags are like "pc:spell:sootheTone" — compare lowercased tail
  return learnedTags.some((t) => {
    if (!t.startsWith("pc:spell:")) return false;
    const tail = t.slice("pc:spell:".length).toLowerCase();
    return tail === spellIdLC;
  });
}

export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  const rules = loadRollRules();
  if (!OPENAI_API_KEY) return fallback("Arbiter disabled (no OPENAI_API_KEY)");

  // Merge all tag feeds into one compact list (and for local checks).
  const mergedTags: string[] = [
    ...(input.sceneTags ?? []),
    ...(input.inventoryTags ?? []),
    ...(input.learnedTags ?? []),
  ].slice(0, 120);

  const msg = input.message.trim();
  const msgLC = msg.toLowerCase();

  // ---------- Rails: fail ONLY on explicit attempts to leave the demo area ----------
  if (hasTag(mergedTags, "rail:demo-area-only") && wantsToLeaveDemo(msg)) {
    return { kind: "auto-fail", reason: "Demo boundary: you can’t leave the preview area.", tags: ["rail-block"] };
  }

  // ---------- Binary capability gates ----------
  // Rope-required → must have pc:rope
  if (wantsRopeUse(msg)) {
    if (!hasTag(mergedTags, "pc:rope")) {
      return { kind: "auto-fail", reason: "You have no rope to do that.", tags: ["needs-rope"] };
    }
  }
  // Ranged shot → must have pc:ranged
  if (wantsRanged(msg)) {
    if (!hasTag(mergedTags, "pc:ranged")) {
      return { kind: "auto-fail", reason: "No ranged weapon available.", tags: ["needs-ranged-weapon"] };
    }
  }
  // Throwing → must have pc:throwable:N with N>0
  if (wantsThrow(msg)) {
    const n = parseInt(tagValue(mergedTags, "pc:throwable") || "0", 10);
    if (!n || n <= 0) {
      return { kind: "auto-fail", reason: "No throwable items available.", tags: ["needs-throwable"] };
    }
  }
  // Lighting torch/lantern → must have a light-capable item
  if (wantsLightAction(msg)) {
    const lightState = tagValue(mergedTags, "pc:light"); // "lit" | "unlit" | "none"
    if (!lightState || lightState === "none") {
      return { kind: "auto-fail", reason: "No torch or lantern to light.", tags: ["needs-light-source"] };
    }
  }

  // ---------- Deterministic "known spell" gate ----------
  const requestedSpells = extractRequestedSpells(msg);
  if (requestedSpells.length) {
    const unknown = requestedSpells.find((s) => !knowsSpell(input.learnedTags, s));
    if (unknown) {
      return {
        kind: "auto-fail",
        reason: `You do not know the spell '${unknown}'.`,
        tags: [`needs-spell:${unknown}`],
      };
    }
  }

  // NOTE: Soft feasibility like “blinded” does NOT cause auto-fail here.

  // ---------- Heuristic nudge for social influence ----------
  const influenceVerbs =
    "(calm|lull|charm|soothe|distract|frighten|intimidate|persuade|lure|mesmerise|mesmerize|confuse|taunt|mislead)";
  const creatureHints = "(creature|goblin|mirefold|beast|guard|lookout|enemy|it|them|him|her)";
  const hardHint =
    new RegExp(`\\b${influenceVerbs}\\b`).test(msgLC) &&
    new RegExp(`\\b${creatureHints}\\b`).test(msgLC);

  // ---------- LLM policy & call ----------
  const systemPrompt = `
You are the Rolls DM. Your scope:
- Classify the action (no-roll, auto-success, auto-fail, fixed, opposed).
- Enforce only binary feasibility gates (physics/rails/must-have items/known spells).
- Do NOT apply soft penalties (e.g., blinded); leave those for the dice/skills system.
- Do NOT cite demo rails unless the player explicitly attempts to leave the demo area.

Policy (authoritative):
${clamp(rules)}

Guidance:
- If the message includes an influence verb (calm, lull, distract, charm, frighten, persuade, lure, mesmerise) AND references a creature/NPC, classify as **opposed** (attackerAbility="CHA", defender="creature") with tag ["social-influence"].
- Ambient actions with no intent to influence remain **no-roll** with tag ["ambient-action"].
- Respect hard rails only for explicit exit/travel attempts.
- Presence/absence signals (pc:ranged, pc:throwable:N, pc:rope, pc:light:lit|unlit|none) inform feasibility; use them only as binary gates when the action explicitly requires them.
- Spells: if a spell is attempted and not known (not in learned tags), the action is **auto-fail** (already enforced deterministically before this step).
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
    character: input.character ?? {},
    hardHint,
    guidance:
      "Prefer 'no-roll' for pure ambience. Prefer 'opposed' for creature influence attempts. Use auto-fail only for physics/explicit rails/missing must-have item/unknown spell."
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 220,
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
    const toolCalls = data?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return fallback("Arbiter fallback (no tool call)");

    const first = toolCalls[0];
    if (first?.function?.name !== "decide_roll") return fallback("Arbiter fallback (wrong tool)");

    let args: any = {};
    try { args = JSON.parse(first.function.arguments || "{}"); }
    catch { return fallback("Arbiter fallback (bad tool args)"); }

    const decision = coerceDecision(args);
    return decision ?? fallback("Arbiter fallback (schema mismatch)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}