// src/services/rolls_dm.ts
//
// Rolls DM (scalable, feasibility-only):
// - Binary gates driven by tags from feeds (inventory/learned/context).
// - LLM only for narrative classification (ambient vs opposed vs fixed).
// - No soft modifiers (blinded etc) — leave them to the dice layer.

import fs from "fs";
import path from "path";

// ---------- Types ----------
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

// ---------- safe coercer for tool outputs ----------
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

// ---------- intent helpers (narrow, not item-specific) ----------
const rx = {
  leaveDemo: /\b(leave|exit|travel|go to|head to|make for)\b/i,
  ranged: /\b(shoot|loose|fire|nock)\b/i,
  throw: /\b(throw|toss|hurl|lob)\b/i,
  ropeUse: /\b(tie|tether|secure|lasso|lower\s+.*\bwith\b\s+rope)\b/i,
  lightAct: /\b(light|ignite|spark)\b.*\b(torch|lantern)\b/i,
  equip: /\b(equip|put on|wear|don)\b/i,
  unequip: /\b(unequip|remove|take off|doff)\b/i,
  mentionsBow: /\b(bow|arrow|nock|loose)\b/i,
  mentionsThrowingAxe: /\b(throwing\s*axe|hand\s*axe)\b/i,
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
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
function parseEquipIntent(message: string) {
  if (!rx.equip.test(message)) return null;
  return { slot: detectSlotFromText(message), slug: extractNamedItemSlug(message) };
}
function parseUnequipIntent(message: string) {
  if (!rx.unequip.test(message)) return null;
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

// ---------- capability registry (generic) ----------
type CapRule = (tags: string[], message: string) => { ok: boolean; failTag?: string; failReason?: string };

// generic numeric helper: pc:throwable:N
function getInt(tags: string[], prefix: string, def = 0) {
  const v = tagValue(tags, prefix);
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

const CAP: Record<string, CapRule> = {
  "weapon:ranged": (tags) => {
    const ok = hasTag(tags, "pc:weapon:ranged") || getInt(tags, "pc:throwable") > 0;
    return ok ? { ok } : { ok: false, failTag: "needs-ranged", failReason: "No ranged or throwable available." };
  },
  "weapon:bow": (tags) => {
    const ok = hasTag(tags, "pc:bow") || hasTag(tags, "pc:crossbow");
    return ok ? { ok } : { ok: false, failTag: "needs-bow", failReason: "You don’t have a bow or crossbow." };
  },
  "weapon:thrown": (tags) => {
    const ok = getInt(tags, "pc:throwable") > 0;
    return ok ? { ok } : { ok: false, failTag: "needs-throwable", failReason: "No throwable items available." };
  },
  "weapon:throwing-axe": (tags) => {
    const ok = getInt(tags, "pc:throwing-axe") > 0;
    return ok ? { ok } : { ok: false, failTag: "needs-throwing-axe", failReason: "No throwing axes available." };
  },
  rope: (tags) => hasTag(tags, "pc:rope") ? { ok: true } : { ok: false, failTag: "needs-rope", failReason: "You have no rope to do that." },
  lightSourcePresent: (tags) => {
    const state = tagValue(tags, "pc:light") || "none";
    return state !== "none" ? { ok: true } : { ok: false, failTag: "needs-light-source", failReason: "No torch or lantern to light." };
  },
};

// ---------- main ----------
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

  // Rails — only if attempting to leave
  if (hasTag(mergedTags, "rail:demo-area-only") && rx.leaveDemo.test(msg)) {
    return { kind: "auto-fail", reason: "Demo boundary: you can’t leave the preview area.", tags: ["rail-block"] };
  }

  // Spells — deterministic feasibility
  const requestedSpells = extractRequestedSpells(msg);
  if (requestedSpells.length) {
    const unknown = requestedSpells.find((s) => !knowsSpell(input.learnedTags, s));
    if (unknown) {
      return { kind: "auto-fail", reason: `You do not know the spell '${unknown}'.`, tags: [`needs-spell:${unknown}`] };
    }
  }

  // Wearables equip/unequip — deterministic feasibility
  const equip = parseEquipIntent(msg);
  if (equip) {
    const slot = equip.slot ?? detectSlotFromText(msg);
    if (slot && equip.slug) {
      const need = `pc:pack:${slot}:${equip.slug}`;
      if (!mergedTags.includes(need)) {
        return { kind: "auto-fail", reason: `You don’t have that ${slot} item in your pack.`, tags: ["needs-wearable", `needs-pack:${slot}:${equip.slug}`] };
      }
      return { kind: "auto-success", reason: `Equipping ${equip.slug.replace(/-/g, " ")}`, tags: ["equip", `slot:${slot}`] };
    }
    if (slot) {
      const anyPack = mergedTags.some((t) => t.startsWith(`pc:pack:${slot}:`));
      if (!anyPack) return { kind: "auto-fail", reason: `No ${slot} item in your pack to equip.`, tags: ["needs-wearable", `needs-pack:${slot}`] };
      return { kind: "auto-success", reason: `Equipping available ${slot} item`, tags: ["equip", `slot:${slot}`] };
    }
  }
  const unequip = parseUnequipIntent(msg);
  if (unequip) {
    const slot = unequip.slot ?? detectSlotFromText(msg);
    if (slot && unequip.slug) {
      const need = `pc:wear:${slot}:${unequip.slug}`;
      if (!mergedTags.includes(need)) {
        return { kind: "auto-fail", reason: `You aren’t wearing that ${slot} item.`, tags: ["not-wearing", `missing:${slot}:${unequip.slug}`] };
      }
      return { kind: "auto-success", reason: `Removing ${unequip.slug.replace(/-/g, " ")}`, tags: ["unequip", `slot:${slot}`] };
    }
    if (slot) {
      if (!mergedTags.includes(`pc:wear:${slot}`)) {
        return { kind: "auto-fail", reason: `You aren’t wearing anything on your ${slot}.`, tags: ["not-wearing", `slot:${slot}`] };
      }
      return { kind: "auto-success", reason: `Removing ${slot} item`, tags: ["unequip", `slot:${slot}`] };
    }
  }

  // Binary capability gates (tag-driven, generic)
  // Rope
  if (rx.ropeUse.test(msg) && !CAP.rope(mergedTags, msg).ok) {
    const r = CAP.rope(mergedTags, msg);
    return { kind: "auto-fail", reason: r.failReason!, tags: [r.failTag!] };
  }
  // Light
  if (rx.lightAct.test(msg) && !CAP.lightSourcePresent(mergedTags, msg).ok) {
    const r = CAP.lightSourcePresent(mergedTags, msg);
    return { kind: "auto-fail", reason: r.failReason!, tags: [r.failTag!] };
  }
  // Ranged/Thrown (generic first, then specific)
  if (rx.ranged.test(msg)) {
    // If they mention “bow/arrow”, enforce bow capability specifically
    if (rx.mentionsBow.test(msg)) {
      const r = CAP["weapon:bow"](mergedTags, msg);
      if (!r.ok) return { kind: "auto-fail", reason: r.failReason!, tags: [r.failTag!] };
    } else {
      const r = CAP["weapon:ranged"](mergedTags, msg);
      if (!r.ok) return { kind: "auto-fail", reason: r.failReason!, tags: [r.failTag!] };
    }
  }
  if (rx.throw.test(msg)) {
    // If they mention “throwing axe”, enforce that specifically
    if (rx.mentionsThrowingAxe.test(msg)) {
      const r = CAP["weapon:throwing-axe"](mergedTags, msg);
      if (!r.ok) return { kind: "auto-fail", reason: r.failReason!, tags: [r.failTag!] };
    } else {
      const r = CAP["weapon:thrown"](mergedTags, msg);
      if (!r.ok) return { kind: "auto-fail", reason: r.failReason!, tags: [r.failTag!] };
    }
  }

  // Heuristic: social influence verbs + creature mentions => opposed CHA vs creature
  const influenceVerbs = "(calm|lull|charm|soothe|distract|frighten|intimidate|persuade|lure|mesmerise|mesmerize|confuse|taunt|mislead)";
  const creatureHints = "(creature|goblin|mirefold|beast|guard|lookout|enemy|it|them|him|her)";
  const hardHint = new RegExp(`\\b${influenceVerbs}\\b`).test(msgLC) && new RegExp(`\\b${creatureHints}\\b`).test(msgLC);

  // LLM: narrative classification (ambient vs fixed/opposed)
  const systemPrompt = `
You are the Rolls DM. Your job:
- Classify the action (no-roll, auto-success, auto-fail, fixed, opposed).
- Binary feasibility is already constrained by tags (items, spells, wearables, rails). Do not invent fails.
- Prefer **no-roll** for pure ambience; **opposed** for influence attempts vs creatures; **fixed** for environment/skill checks.
Policy (authoritative):
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
    character: input.character ?? {},
    hardHint,
    guidance:
      "Prefer 'no-roll' for ambience; 'opposed' for creature influence; 'fixed' for environment/object tests. Do not enforce binary restrictions here — tags already gate feasibility."
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

    const decision = coerceDecision(args) ?? fallback("Arbiter fallback (schema mismatch)");
    return decision;
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}