// src/services/rolls_dm.ts
//
// Rolls DM: feasibility-only classifier.
// - Binary gates for: rails, must-have items (bow, crossbow, handcannon, throwing axe, rope, light), known spells
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

// --- coerceDecision ---
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
function mentionsCrossbow(message: string) { return /\b(crossbow|bolt)\b/i.test(message); }
function mentionsHandcannon(message: string) { return /\b(handcannon|pistol|gun|rifle|musket|cannon)\b/i.test(message); }
function wantsThrow(message: string)   { return /\b(throw|toss|hurl|lob)\b/i.test(message); }
function mentionsThrowingAxe(message: string) { return /\b(throwing\s*axe|hand\s*axe)\b/i.test(message); }
function wantsRopeUse(message: string){ return /\b(tie|tether|secure|lasso|lower\s+.*\bwith\b\s+rope)\b/i.test(message); }
function wantsLightAction(message: string) { return /\b(light|ignite|spark)\b.*\b(torch|lantern)\b/i.test(message); }
function wantsToLeaveDemo(message: string) { return /\b(leave|exit|travel|go to|head to|make for)\b/i.test(message); }

// ---------- spells ----------
function extractRequestedSpells(message: string): string[] {
  const m = message.toLowerCase();
  const found = new Set<string>();
  const verbs = "(cast|use|conjure|invoke|unleash|channel|summon)";
  const afterVerb = new RegExp(`\\b${verbs}\\b\\s+([a-z][a-z\\-']{2,24})\\b`, "gi");
  let m1: RegExpExecArray | null;
  while ((m1 = afterVerb.exec(m))) found.add(m1[1]);
  if (/\bfire\s*ball\b/i.test(message)) found.add("fireball");
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

  // ---------- Rails ----------
  if (hasTag(mergedTags, "rail:demo-area-only") && wantsToLeaveDemo(msg)) {
    return { kind: "auto-fail", reason: "Demo boundary: you can’t leave the preview area.", tags: ["rail-block"] };
  }

  // ---------- Specific weapon gating ----------
  if (mentionsBow(msg)) {
    if (!hasTag(mergedTags, "pc:bow")) {
      return { kind: "auto-fail", reason: "You don’t have a bow.", tags: ["needs-bow"] };
    }
  }
  if (mentionsCrossbow(msg)) {
    if (!hasTag(mergedTags, "pc:crossbow")) {
      return { kind: "auto-fail", reason: "You don’t have a crossbow.", tags: ["needs-crossbow"] };
    }
  }
  if (mentionsHandcannon(msg)) {
    if (!hasTag(mergedTags, "pc:handcannon")) {
      return { kind: "auto-fail", reason: "You don’t have a handcannon.", tags: ["needs-handcannon"] };
    }
  }
  if (mentionsThrowingAxe(msg)) {
    const qty = parseInt(tagValue(mergedTags, "pc:throwing-axe") || "0", 10);
    if (qty <= 0) {
      return { kind: "auto-fail", reason: "No throwing axes available.", tags: ["needs-throwing-axe"] };
    }
  }

  // ---------- Rope ----------
  if (wantsRopeUse(msg) && !hasTag(mergedTags, "pc:rope")) {
    return { kind: "auto-fail", reason: "You have no rope to do that.", tags: ["needs-rope"] };
  }

  // ---------- Light ----------
  if (wantsLightAction(msg) && !hasTag(mergedTags, "pc:light:lit") && !hasTag(mergedTags, "pc:light:unlit")) {
    return { kind: "auto-fail", reason: "No torch or lantern to light.", tags: ["needs-light-source"] };
  }

  // ---------- Spells ----------
  const requestedSpells = extractRequestedSpells(msg);
  if (requestedSpells.length) {
    const unknown = requestedSpells.find((s) => !knowsSpell(input.learnedTags, s));
    if (unknown) {
      return { kind: "auto-fail", reason: `You do not know the spell '${unknown}'.`, tags: [`needs-spell:${unknown}`] };
    }
  }

  // ---------- Fallback to LLM ----------
  // (kept simple for now, just ambient vs influence vs combat handled by prompt rules)
  return {
    kind: "no-roll",
    reason: "Ambient or undecided action — leave to narrator unless contradicted.",
    tags: ["arbiter-fallback"],
  };
}