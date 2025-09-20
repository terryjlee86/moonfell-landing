// src/services/roll_resolver.ts
//
// Pure hit resolution (no narration, no damage).
// - Uses dice_engine for d20 + adv/dis
// - Uses modifiers.ts to compute ATTACK-side situational effects
// - For now, DEFENSE-side mods are NOT derived from player tags (set to 0) until creature tags exist.

import { rollD20, seedFromParts } from "./dice_engine";
import { gatherMods } from "../data/modifiers";

export type Ability = "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA";
export type RollTier =
  | "fail"
  | "mixed"
  | "success"
  | "strong"
  | "crit-fail"
  | "crit-success";

export type RollContext = {
  // Seeding & debug
  seedParts: { scenarioId?: string; turn?: number; userHash?: string; extra?: string };
  debugRoll?: boolean;

  // Feeds (merged tags derive situational effects)
  sceneTags: string[];
  inventoryTags: string[];
  learnedTags: string[];

  // Attack side
  ability: Ability;                // e.g., "STR" for sword, "AGI" for throw
  attackerAbilityBonus?: number;   // 0 for now (you can compute from stats later)

  // Target side
  opposed?: boolean;               // true -> opposed vs defense; false -> fixed DC
  defenderDefenseBonus?: number;   // simple baseline for creature defense (e.g., 2)
  dcHint?: "easy" | "standard" | "hard" | "heroic"; // for fixed DC
  armorClass?: number; // Added for AC target
};

export type RollDebug = {
  d20: number; second?: number; used: number;
  mode: "normal" | "adv" | "dis";
  modsAttack: Array<{ source: string; value: number | "adv" | "dis" }>;
  modsDefense?: Array<{ source: string; value: number | "adv" | "dis" }>;
  target: string; total: number; margin: number;
  abilityBonus?: number;
  modsAttackTotal?: number;
};

export type RollResult = {
  tier: RollTier;
  margin: number;
  critical?: "nat1" | "nat20";
  debug?: RollDebug;
};

// ---- Tunable grip constants (attack side only; damage is handled elsewhere) ----
const PENALTY_UNSUPPORTED_ATTACK: number = -2; // Encounter Bible: unsupported grip feels worse to hit
const BONUS_TWOHAND_ATTACK: number = 1;       // Optional small boost when using two hands (versatile or 2H readied)

function dcFromHint(h?: "easy" | "standard" | "hard" | "heroic"): number {
  switch (h) {
    case "easy": return 10;
    case "hard": return 16;
    case "heroic": return 20;
    case "standard":
    default: return 14;
  }
}

function tierFrom(d20: number, margin: number): RollTier {
  if (d20 === 1)  return "crit-fail";
  if (d20 === 20) return "crit-success";
  if (margin <= -5) return "fail";
  if (margin < 0)   return "mixed";
  if (margin < 5)   return "success";
  return "strong";
}

/** Resolve a HIT check: fixed DC or opposed vs defense. No damage — just hit quality. */
export function resolveHit(ctx: RollContext): RollResult {
  const tags = [...(ctx.sceneTags || []), ...(ctx.inventoryTags || []), ...(ctx.learnedTags || [])];

  // ATTACK mods / adv-dis
  const atkMods = gatherMods("attack", ctx.ability, tags);

  // DEFENSE mods: UNTIL we have creature tags, do NOT derive from player tags.
  // Keep this structure so we can plug in creature-derived effects later.
  const defMods = ctx.opposed
    ? { bonus: 0, mode: "normal" as const, applied: [] as Array<{ source: string; value: any }> }
    : { bonus: 0, mode: "normal" as const, applied: [] as Array<{ source: string; value: any }> };

  // Pick roll mode from attack-side only (simple rule; refine later)
  const rollMode = atkMods.mode;

  const seed = seedFromParts(ctx.seedParts);
  const r = rollD20({ seed, mode: rollMode });

  const abilityBonus = ctx.attackerAbilityBonus ?? 0;

  // ---- Grip-derived attack adjustments (from inventory feed tags) ----
  const isUnsupported = tags.includes("pc:grip:unsupported");
  const isTwoHand = tags.includes("pc:grip:twohand") && !isUnsupported;

  let gripAttackAdj = 0;
  if (isUnsupported) {
    gripAttackAdj += PENALTY_UNSUPPORTED_ATTACK;
    atkMods.applied.push({ source: "grip:unsupported", value: PENALTY_UNSUPPORTED_ATTACK });
  } else if (isTwoHand && BONUS_TWOHAND_ATTACK !== 0) {
    gripAttackAdj += BONUS_TWOHAND_ATTACK;
    atkMods.applied.push({ source: "grip:twohand", value: BONUS_TWOHAND_ATTACK });
  }

  // Attack total
  const totalAttack = r.used + abilityBonus + atkMods.bonus + gripAttackAdj;

  // Target: fixed DC or AC-based defense
  let target = ctx.armorClass ?? 9; // Default to 9 if not provided
  let targetLabel = `AC ${target}`;
  if (ctx.opposed) {
    target = ctx.armorClass ?? 9; // Use the calculated AC, default to 9
    targetLabel = `AC ${target}`;
  } else {
    target = dcFromHint(ctx.dcHint);
    targetLabel = `DC ${target}`;
  }

  const margin = totalAttack - target;
  const tier = tierFrom(r.used, margin);

  // For a robust breakdown, compute modsAttackTotal from the actual numbers used.
  // This guarantees: used + abilityBonus + modsAttackTotal === totalAttack
  const modsAttackTotal = totalAttack - r.used - abilityBonus;

  const debug: RollDebug | undefined = ctx.debugRoll ? {
    d20: r.d20, second: r.second, used: r.used,
    mode: rollMode,
    modsAttack: atkMods.applied,
    // Until we implement creature-derived defense effects, omit modsDefense
    modsDefense: undefined,
    target: targetLabel,
    total: totalAttack,
    margin,
    abilityBonus,
    modsAttackTotal
  } : undefined;

  return {
    tier,
    margin,
    critical: r.used === 1 ? "nat1" : r.used === 20 ? "nat20" : undefined,
    debug
  };
}