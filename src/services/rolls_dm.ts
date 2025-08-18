//
// Rolls DM: feasibility-only classifier.
// - Binary gates for: rails, must-have items (bow, crossbow, handcannon, throwing axe, rope, light), known spells
// - Leaves soft modifiers (blinded, armor penalties) to the dice system later.
// - LLM can be reintroduced later for nuance; current pass is deterministic.
//

import fs from "fs";
import path from "path";
import {
  wantsRanged,
  mentionsBow,
  mentionsCrossbow,
  mentionsHandcannon,
  wantsThrow,
  mentionsThrowingAxe,
  wantsRopeUse,
  wantsLightAction,
  wantsToLeaveDemo,
  extractRequestedSpells,
} from "./rolls_helpers";

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

// ✅ Exported so test-chat can import it
export type ArbiterDecision =
  | { kind: "no-roll"; reason: string; tags?: string[] }
  | { kind: "auto-success"; reason: string; tags?: string[] }
  | { kind: "auto-fail"; reason: string; tags?: string[] }
  | { kind: "fixed"; ability: string; dcHint?: string; context?: string; reason?: string; tags?: string[] }
  | { kind: "opposed"; attackerAbility: string; defender: string; context?: string; reason?: string; tags?: string[] };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // not used in this trimmed pass
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // reserved for later

// ---------- utils ----------
function loadRollRules(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src", "prompts", "rolls", "rolls_rules.md"), "utf8");
  } catch {
    return "[No rolls_rules.md found]";
  }
}
function clamp(text: string, max = 6000) {
  return !text ? "" : text.length > max ? text.slice(0, max) + "\n\n...[trimmed]..." : text;
}
function fallback(reason: string): ArbiterDecision {
  return { kind: "no-roll", reason, tags: ["arbiter-fallback"] };
}
const hasTag = (tags: string[], p: string) => tags.some((t) => t === p || t.startsWith(p + ":"));
const tagValue = (tags: string[], prefix: string): string | undefined =>
  tags.find((t) => t.startsWith(prefix + ":"))?.split(":").slice(1).join(":");

// ---------- spells ----------
function knowsSpell(learnedTags: string[] | undefined, spellIdLC: string): boolean {
  if (!learnedTags || learnedTags.length === 0) return false;
  return learnedTags.some((t) => t.startsWith("pc:spell:") && t.slice("pc:spell:".length).toLowerCase() === spellIdLC);
}

// ---------- main ----------
export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  // still load rules so we can use them later w/ LLM; no effect on this deterministic pass
  loadRollRules();

  const mergedTags: string[] = [
    ...(input.sceneTags ?? []),
    ...(input.inventoryTags ?? []),
    ...(input.learnedTags ?? []),
  ].slice(0, 200);

  const msg = input.message.trim();

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

  // ---------- Throwing / generic ranged ----------
  if (mentionsThrowingAxe(msg)) {
    const qty = parseInt(tagValue(mergedTags, "pc:throwing-axe") || "0", 10);
    if (qty <= 0) {
      return { kind: "auto-fail", reason: "No throwing axes available.", tags: ["needs-throwing-axe"] };
    }
  }
  if (wantsRanged(msg) && !mentionsBow(msg) && !mentionsCrossbow(msg) && !mentionsHandcannon(msg)) {
    // generic "shoot": require that some ranged capability exists (bow/crossbow/throwable>0)
    const hasBow = hasTag(mergedTags, "pc:bow");
    const hasXbow = hasTag(mergedTags, "pc:crossbow");
    const throwables = parseInt(tagValue(mergedTags, "pc:throwable") || "0", 10);
    if (!hasBow && !hasXbow && throwables <= 0) {
      return { kind: "auto-fail", reason: "No ranged option available.", tags: ["needs-ranged-weapon"] };
    }
  }

  // ---------- Rope ----------
  if (wantsRopeUse(msg) && !hasTag(mergedTags, "pc:rope")) {
    return { kind: "auto-fail", reason: "You have no rope to do that.", tags: ["needs-rope"] };
  }

  // ---------- Light ----------
  if (wantsLightAction(msg)) {
    const hasLit = hasTag(mergedTags, "pc:light:lit");
    const hasUnlit = hasTag(mergedTags, "pc:light:unlit");
    if (!hasLit && !hasUnlit) {
      return { kind: "auto-fail", reason: "No torch or lantern to light.", tags: ["needs-light-source"] };
    }
  }

  // ---------- Spells ----------
  const requestedSpells = extractRequestedSpells(msg);
  if (requestedSpells.length) {
    const unknown = requestedSpells.find((s: string) => !knowsSpell(input.learnedTags, s)); // <-- typed s
    if (unknown) {
      return { kind: "auto-fail", reason: `You do not know the spell '${unknown}'.`, tags: [`needs-spell:${unknown}`] };
    }
  }

  // ---------- Default: let the narrator handle it (no roll) ----------
  return {
    kind: "no-roll",
    reason: "Ambient or undecided action — leave to narrator unless contradicted.",
    tags: ["arbiter-fallback"],
  };
}