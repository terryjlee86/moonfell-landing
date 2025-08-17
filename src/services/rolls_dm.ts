// src/services/rolls_dm.ts
//
// Rolls DM: classifies player input and enforces binary feasibility.
// Distinguishes specific ranged capability (bow/crossbow) from throwables.
// Unknown spells and rails are handled deterministically; soft penalties are deferred.

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
  sceneTags?: string[];
  inventoryTags?: string[];
  learnedTags?: string[];
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

function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.kind !== "string") return null;
  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string") : undefined;
  switch (obj.kind) {
    case "no-roll":
    case "auto-success":
    case "auto-fail":
      if (typeof obj.reason === "string" && obj.reason.length > 0) return { kind: obj.kind, reason: obj.reason, tags };
      return null;
    case "fixed":
      if (typeof obj.ability === "string")
        return { kind: "fixed", ability: obj.ability, dcHint: typeof obj.dcHint === "string" ? obj.dcHint : undefined, context: typeof obj.context === "string" ? obj.context : undefined, reason: typeof obj.reason === "string" ? obj.reason : undefined, tags };
      return null;
    case "opposed":
      if (typeof obj.attackerAbility === "string" && typeof obj.defender === "string")
        return { kind: "opposed", attackerAbility: obj.attackerAbility, defender: obj.defender, context: typeof obj.context === "string" ? obj.context : undefined, reason: typeof obj.reason === "string" ? obj.reason : undefined, tags };
      return null;
    default: return null;
  }
}

// ---------- helpers (deterministic, binary) ----------
const hasTag = (tags: string[], p: string) => tags.some((t) => t === p || t.startsWith(p + ":"));
const tagValue = (tags: string[], prefix: string): string | undefined =>
  tags.find((t) => t.startsWith(prefix + ":"))?.split(":").slice(1).join(":");

// intents
function wantsRanged(message: string) { return /\b(shoot|nock|loose|fire)\b/i.test(message); }
function mentionsBow(message: string)  { return /\b(bow|arrow|nock|loose)\b/i.test(message); }
function wantsThrow(message: string)   { return /\b(throw|toss|hurl|lob)\b/i.test(message); }
function mentionsThrowingAxe(message: string) { return /\b(throwing\s*axe|hand\s*axe)\b/i.test(message); }
function wantsRopeUse(message: string){ return /\b(tie|tether|secure|lasso|lower\s+.*\bwith\b\s+rope)\b/i.test(message); }
function wantsLightAction(message: string) { return /\b(light|ignite|spark)\b.*\b(torch|lantern)\b/i.test(message); }
function wantsToLeaveDemo(message: string) { return /\b(leave|exit|travel|go to|head to|make for)\b/i.test(message); }

// spells
function extractRequestedSpells(message: string): string[] {
  const m = message.toLowerCase();
  const found = new Set<string>();
  const verbs = "(cast|use|conjure|invoke|unleash|channel|summon)";
  const afterVerb = new RegExp(`\\b${verbs}\\b\\s+the\\s+([a-z][a-z\\-']{2,24})\\b`, "gi");
  const afterVerb2 = new RegExp(`\\b${verbs}\\b\\s+([a-z][a-z\\-']{2,24})\\b`, "gi");
  const xSpell = /\b([a-z][a-z\-']{2,24})\s+spell\b/gi;
  let m1: RegExpExecArray | null;
  while ((m1 = afterVerb.exec(m))) found.add(m1[1]);
  while ((m1 = afterVerb2.exec(m))) found.add(m1[1]);
  while ((m1 = xSpell.exec(m))) found.add(m1[1]);
  if (/\bfire\s*ball\b/i.test(message)) found.add("fireball");
  if (/\bfirebolt\b/i.test(message)) found.add("firebolt");
  if (/\bspark\s*light\b/i.test(message)) found.add("sparklight");
  return Array.from(found);
}
function knowsSpell(learnedTags: string[] | undefined, spellIdLC: string): boolean {
  if (!learnedTags || learnedTags.length === 0) return false;
  return learnedTags.some((t) => t.startsWith("pc:spell:") && t.slice("pc:spell:".length).toLowerCase() === spellIdLC);
}

export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  const rules = loadRollRules();
  if (!OPENAI_API_KEY) return fallback("Arbiter disabled (no OPENAI_API_KEY)");

  const mergedTags: string[] = [
    ...(input.sceneTags ?? []),
    ...(input.inventoryTags ?? []),
    ...(input.learnedTags ?? []),
  ].slice(0, 160);

  const msg = input.message.trim();
  const msgLC = msg.toLowerCase();

  // ---------- Rails: fail ONLY on explicit attempts to leave the demo area ----------
  if (hasTag(mergedTags, "rail:demo-area-only") && wantsToLeaveDemo(msg)) {
    return { kind: "auto-fail", reason: "Demo boundary: you can’t leave the preview area.", tags: ["rail-block"] };
  }

  // ---------- Binary capability gates ----------
  let binaryFailed = false;
  const prereq: { rangedOK?: boolean; bowOK?: boolean; crossbowOK?: boolean; throwOK?: boolean; ropeOK?: boolean; lightCapOK?: boolean } = {};

  const hasBow = hasTag(mergedTags, "pc:bow");
  const hasCrossbow = hasTag(mergedTags, "pc:crossbow");
  const throwingAxes = parseInt(tagValue(mergedTags, "pc:throwing-axe") || "0", 10);
  const totalThrowable = parseInt(tagValue(mergedTags, "pc:throwable") || "0", 10);

  // Rope
  if (wantsRopeUse(msg)) {
    if (!hasTag(mergedTags, "pc:rope")) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "You have no rope to do that.", tags: ["needs-rope"] };
    }
    prereq.ropeOK = true;
  }

  // Bow-specific intent → must have bow OR crossbow
  if (mentionsBow(msg)) {
    if (!hasBow && !hasCrossbow) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "You don’t have a bow or crossbow.", tags: ["needs-bow"] };
    }
    prereq.bowOK = hasBow || hasCrossbow;
  }

  // Generic ranged verb "shoot" (without saying bow)
  const rangedIntent = wantsRanged(msg);
  if (rangedIntent && !mentionsBow(msg)) {
    // If no bow/crossbow but throwable exists, don't fail; allow model to classify (could suggest throw).
    // If no ranged capability at all (no bow/crossbow and no throwable), auto-fail.
    if (!hasBow && !hasCrossbow && totalThrowable <= 0) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "No ranged option available.", tags: ["needs-ranged-weapon"] };
    }
    // mark ranged prerequisite as OK if any ranged option exists
    prereq.rangedOK = hasBow || hasCrossbow || totalThrowable > 0;
  }

  // Throwing intent → must have throwable items (prefer specific: throwing-axe)
  const throwIntent = wantsThrow(msg);
  if (throwIntent) {
    if (mentionsThrowingAxe(msg) && throwingAxes <= 0) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "No throwing axes available.", tags: ["needs-throwing-axe"] };
    }
    if (totalThrowable <= 0) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "No throwable items available.", tags: ["needs-throwable"] };
    }
    prereq.throwOK = true;
  }

  // Lighting torch/lantern
  const lightIntent = wantsLightAction(msg);
  if (lightIntent) {
    const lightState = tagValue(mergedTags, "pc:light"); // "lit" | "unlit" | "none"
    if (!lightState || lightState === "none") {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "No torch or lantern to light.", tags: ["needs-light-source"] };
    }
    prereq.lightCapOK = true;
  }

  // ---------- Deterministic "known spell" gate ----------
  const requestedSpells = extractRequestedSpells(msg);
  if (requestedSpells.length) {
    const unknown = requestedSpells.find((s) => !knowsSpell(input.learnedTags, s));
    if (unknown) {
      binaryFailed = true;
      return {
        kind: "auto-fail",
        reason: `You do not know the spell '${unknown}'.`,
        tags: [`needs-spell:${unknown}`],
      };
    }
  }

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
- Enforce binary feasibility gates (physics/explicit rails/must-have items/known spells/specific weapon requirements).
- Do NOT apply soft penalties (e.g., blinded); leave those for the dice/skills system.
- Do NOT cite demo rails unless the player explicitly attempts to leave the demo area.

Policy (authoritative):
${clamp(rules)}

Guidance:
- If the message includes an influence verb (calm, lull, distract, charm, frighten, persuade, lure, mesmerise) AND references a creature/NPC, classify as **opposed** (attackerAbility="CHA", defender="creature") with tag ["social-influence"].
- Ambient actions with no intent to influence remain **no-roll** with tag ["ambient-action"].
- Ranged specificity matters: “shoot with my bow” requires pc:bow or pc:crossbow. Throwing requires pc:throwable:N (and ideally a specific item like pc:throwing-axe:N).
- Spells: attempting an unknown spell is **auto-fail** (already enforced deterministically before this step).
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
      "Prefer 'no-roll' for pure ambience. Prefer 'opposed' for creature influence attempts. Use auto-fail only for physics/explicit rails/missing specific required item/unknown spell."
  };

  const guard = {
    binaryFailed,
    rangedIntentAllowed:
      (mentionsBow(msg) && (hasBow || hasCrossbow)) ||
      (wantsRanged(msg) && (hasBow || hasCrossbow || totalThrowable > 0)),
    throwIntentAllowed: wantsThrow(msg) && totalThrowable > 0,
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

    let decision = coerceDecision(args) ?? fallback("Arbiter fallback (schema mismatch)");

    // ---------- Post-LLM sanity guard ----------
    if (!guard.binaryFailed && decision.kind === "auto-fail") {
      const reasonLC = (decision as any).reason?.toLowerCase() || "";

      // If ranged is clearly intended and prerequisites exist, override bogus auto-fail.
      if (guard.rangedIntentAllowed) {
        decision = {
          kind: "fixed",
          ability: "AGI",
          reason: "Ranged action with prerequisites present; resolve with a roll.",
          tags: ["ranged-attack", "guard:override-auto-fail"].concat(decision.tags || []),
        };
      } else if (guard.throwIntentAllowed) {
        decision = {
          kind: "fixed",
          ability: "AGI",
          reason: "Throwing action with prerequisites present; resolve with a roll.",
          tags: ["throw-attack", "guard:override-auto-fail"].concat(decision.tags || []),
        };
      } else if (/demo|rail/.test(reasonLC) && !wantsToLeaveDemo(msg)) {
        // If model cited rails spuriously, but the user didn't try to leave, normalize.
        if (/\b(attack|strike|grab|climb|jump|push|pull|shoot|throw|tie|light|ignite)\b/i.test(msg)) {
          decision = {
            kind: "fixed",
            ability: "AGI",
            reason: "Action permitted within demo area; resolve with a roll.",
            tags: ["guard:strip-spurious-rail"].concat(decision.tags || []),
          };
        } else {
          decision = { kind: "no-roll", reason: "Ambient within demo area.", tags: ["guard:strip-spurious-rail"].concat(decision.tags || []) };
        }
      }
    }

    return decision;
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}