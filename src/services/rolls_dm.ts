// src/services/rolls_dm.ts
//
// Rolls DM: feasibility-only classifier.
// - Binary gates for: rails, must-have items (bow/crossbow, throwing axe, rope, light), known spells
// - Wearables equip/unequip using feed tags from inventory_feed.ts
// - Leaves soft modifiers (blinded, armor penalties) to the dice system later.
// - Calls LLM for classification; enforces post-LLM guards to avoid spurious auto-fails.

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
const hasTag = (tags: string[], p: string) => tags.some((t) => t === p || t.startsWith(p + ":"));
const tagValue = (tags: string[], prefix: string): string | undefined =>
  tags.find((t) => t.startsWith(prefix + ":"))?.split(":").slice(1).join(":");

// --- coerceDecision (ADDED BACK) ---
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

// ---------- message intent helpers ----------
function wantsRanged(message: string) { return /\b(shoot|nock|loose|fire)\b/i.test(message); }
function mentionsBow(message: string)  { return /\b(bow|arrow|nock|loose)\b/i.test(message); }
function wantsThrow(message: string)   { return /\b(throw|toss|hurl|lob)\b/i.test(message); }
function mentionsThrowingAxe(message: string) { return /\b(throwing\s*axe|hand\s*axe)\b/i.test(message); }
function wantsRopeUse(message: string){ return /\b(tie|tether|secure|lasso|lower\s+.*\bwith\b\s+rope)\b/i.test(message); }
function wantsLightAction(message: string) { return /\b(light|ignite|spark)\b.*\b(torch|lantern)\b/i.test(message); }
function wantsToLeaveDemo(message: string) { return /\b(leave|exit|travel|go to|head to|make for)\b/i.test(message); }

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------- wearables intent parsing ----------
type WearIntent = { slot?: WearableSlot; slug?: string };
type WearableSlot = "head"|"chest"|"hands"|"legs"|"feet"|"back"|"waist"|"ring1"|"ring2"|"amulet";

function detectSlotFromText(m: string): WearableSlot | undefined {
  const s = m.toLowerCase();
  if (/\b(head|helm|helmet|coif|cap|hood)\b/.test(s)) return "head";
  if (/\b(chest|torso|armor|armour|hauberk|coat|jerkin|breastplate|cuirass)\b/.test(s)) return "chest";
  if (/\b(hands|bracers|gloves|gauntlets|vambraces)\b/.test(s)) return "hands";
  if (/\b(legs|pants|trousers|greaves|leggings|hose)\b/.test(s)) return "legs";
  if (/\b(feet|boots|shoes|sabaton|sabatons)\b/.test(s)) return "feet";
  if (/\b(back|cloak|cape)\b/.test(s)) return "back";
  if (/\b(waist|belt|sash)\b/.test(s)) return "waist";
  if (/\b(amulet|necklace|talisman|pendant)\b/.test(s)) return "amulet";
  if (/\b(ring|signet)\b/.test(s)) return "ring1";
  return undefined;
}

function extractNamedItemSlug(m: string): string | undefined {
  const s = m.toLowerCase();
  const pat = /\b(equip|put on|wear|don|remove|take off|doff|unequip)\b\s+([a-z0-9][a-z0-9\s\-']{2,40})/i;
  const m2 = pat.exec(s);
  if (!m2) return undefined;
  const phrase = m2[2].trim().replace(/\b(my|the|a|an)\b/g, "").trim();
  if (!phrase) return undefined;
  return slugify(phrase);
}

function parseEquipIntent(message: string): WearIntent | null {
  if (!/\b(equip|put on|wear|don)\b/i.test(message)) return null;
  return { slot: detectSlotFromText(message), slug: extractNamedItemSlug(message) };
}
function parseUnequipIntent(message: string): WearIntent | null {
  if (!/\b(unequip|remove|take off|doff)\b/i.test(message)) return null;
  return { slot: detectSlotFromText(message), slug: extractNamedItemSlug(message) };
}

// ---------- spells ----------
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
  ].slice(0, 200);

  const msg = input.message.trim();
  const msgLC = msg.toLowerCase();

  // ---------- Rails: only if trying to leave ----------
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

  // Light
  const lightIntent = wantsLightAction(msg);
  if (lightIntent) {
    const lightState = tagValue(mergedTags, "pc:light"); // "lit" | "unlit" | "none"
    if (!lightState || lightState === "none") {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "No torch or lantern to light.", tags: ["needs-light-source"] };
    }
    prereq.lightCapOK = true;
  }

  // Bow-specific
  if (mentionsBow(msg)) {
    if (!hasBow && !hasCrossbow) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "You don’t have a bow or crossbow.", tags: ["needs-bow"] };
    }
    prereq.bowOK = hasBow || hasCrossbow;
  }

  // Generic ranged (shoot) without specifying bow
  const rangedIntent = wantsRanged(msg);
  if (rangedIntent && !mentionsBow(msg)) {
    if (!hasBow && !hasCrossbow && totalThrowable <= 0) {
      binaryFailed = true;
      return { kind: "auto-fail", reason: "No ranged option available.", tags: ["needs-ranged-weapon"] };
    }
    prereq.rangedOK = true;
  }

  // Throwing
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

  // ---------- Wearables (equip/unequip) ----------
  const equip = parseEquipIntent(msg);
  if (equip) {
    const slot = equip.slot ?? detectSlotFromText(msg);
    if (equip.slug && slot) {
      const need = `pc:pack:${slot}:${equip.slug}`;
      const ok = mergedTags.some((t) => t === need);
      if (!ok) {
        binaryFailed = true;
        return { kind: "auto-fail", reason: `You don’t have that ${slot} item in your pack.`, tags: ["needs-wearable", `needs-pack:${slot}:${equip.slug}`] };
      }
      return { kind: "auto-success", reason: `Equipping ${equip.slug.replace(/-/g, " ")}`, tags: ["equip", `slot:${slot}`] };
    }
    if (slot) {
      const anyPack = mergedTags.some((t) => t.startsWith(`pc:pack:${slot}:`));
      if (!anyPack) {
        binaryFailed = true;
        return { kind: "auto-fail", reason: `No ${slot} item in your pack to equip.`, tags: ["needs-wearable", `needs-pack:${slot}`] };
      }
      return { kind: "auto-success", reason: `Equipping available ${slot} item`, tags: ["equip", `slot:${slot}`] };
    }
  }

  const unequip = parseUnequipIntent(msg);
  if (unequip) {
    const slot = unequip.slot ?? detectSlotFromText(msg);
    if (slot) {
      if (unequip.slug) {
        const need = `pc:wear:${slot}:${unequip.slug}`;
        const ok = mergedTags.some((t) => t === need);
        if (!ok) {
          binaryFailed = true;
          return { kind: "auto-fail", reason: `You aren’t wearing that ${slot} item.`, tags: ["not-wearing", `missing:${slot}:${unequip.slug}`] };
        }
        return { kind: "auto-success", reason: `Removing ${unequip.slug.replace(/-/g, " ")}`, tags: ["unequip", `slot:${slot}`] };
      } else {
        const ok = mergedTags.some((t) => t === `pc:wear:${slot}`);
        if (!ok) {
          binaryFailed = true;
          return { kind: "auto-fail", reason: `You aren’t wearing anything on your ${slot}.`, tags: ["not-wearing", `slot:${slot}`] };
        }
        return { kind: "auto-success", reason: `Removing ${slot} item`, tags: ["unequip", `slot:${slot}`] };
      }
    }
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
- Enforce only *binary* feasibility (physics/explicit rails/must-have items/known spells/specific weapon requirements/wearables equip-unequip).
- Do NOT apply soft penalties (e.g., blinded); leave those for the dice/skills system.
- Do NOT cite demo rails unless the player explicitly attempts to leave the demo area.

Policy (authoritative):
${clamp(rules)}

Guidance:
- If the message includes an influence verb (calm, lull, distract, charm, frighten, persuade, lure, mesmerise) AND references a creature/NPC, classify as **opposed** (attackerAbility="CHA", defender="creature") with tag ["social-influence"].
- Ambient actions with no intent to influence remain **no-roll** with tag ["ambient-action"].
- Ranged specificity matters: “shoot with my bow” requires pc:bow or pc:crossbow. Throwing requires pc:throwable:N (and ideally pc:throwing-axe:N).
- Wearables:
  - Removing something requires \`pc:wear:<slot>\` (and \`pc:wear:<slot>:<slug>\` if named).
  - Equipping something requires \`pc:pack:<slot>:<slug>\` (or any pack item for that slot if unspecified).
- Spells: attempting an unknown spell is **auto-fail** (already enforced deterministically).
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
      "Prefer 'no-roll' for pure ambience. Prefer 'opposed' for creature influence attempts. Use auto-fail only for physics/explicit rails/missing specific required item/unknown spell/invalid wearables action."
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