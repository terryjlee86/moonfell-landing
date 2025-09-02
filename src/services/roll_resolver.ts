// src/services/roll_resolver.ts
import { rollD20, seedFromParts } from "./dice_engine";
import { gatherMods } from "../data/modifiers";

export type Ability = "STR"|"AGI"|"END"|"INT"|"WIL"|"CHA";
export type RollTier = "fail" | "mixed" | "success" | "strong" | "crit-fail" | "crit-success";

export type RollContext = {
  // Common
  seedParts: { scenarioId?: string; turn?: number; userHash?: string; extra?: string };
  debugRoll?: boolean;

  // Feeds
  sceneTags: string[];
  inventoryTags: string[];
  learnedTags: string[];

  // Attacker
  ability: Ability;             // e.g., "STR" for sword
  attackerAbilityBonus?: number; // if you later add stat→mod; else 0

  // Defender (for opposed)
  defenderDefenseBonus?: number; // simple baseline defense; start at 0..2
  opposed?: boolean;             // opposed vs defense (goblin) instead of DC
  dcHint?: "easy"|"standard"|"hard"|"heroic"; // for fixed DC cases
};

export type RollDebug = {
  d20: number; second?: number; used: number;
  mode: "normal"|"adv"|"dis";
  modsAttack: Array<{source:string; value:number|"adv"|"dis"}>;
  modsDefense?: Array<{source:string; value:number|"adv"|"dis"}>;
  target: string; total: number; margin: number;
};

export type RollResult = {
  tier: RollTier;
  margin: number;
  critical?: "nat1" | "nat20";
  debug?: RollDebug;
};

function dcFromHint(h?: "easy"|"standard"|"hard"|"heroic"): number {
  switch (h) {
    case "easy": return 10;
    case "hard": return 16;
    case "heroic": return 20;
    case "standard":
    default: return 14;
  }
}

function tierFrom(d20: number, margin: number): RollTier {
  if (d20 === 1) return "crit-fail";
  if (d20 === 20) return "crit-success";
  if (margin <= -5) return "fail";
  if (margin < 0) return "mixed";
  if (margin < 5) return "success";
  return "strong";
}

/** Resolve a HIT check: fixed DC or opposed vs defense. No damage — just hit quality. */
export function resolveHit(ctx: RollContext): RollResult {
  const tags = [...(ctx.sceneTags||[]), ...(ctx.inventoryTags||[]), ...(ctx.learnedTags||[])];

  // Attack side modifiers / adv-dis
  const atkMods = gatherMods("attack", ctx.ability, tags);

  // Defense side (only for opposed); for fixed DC we use dcFromHint
  const defMods = ctx.opposed ? gatherMods("defense", ctx.ability, tags) : { bonus: 0, mode: "normal", applied: [] };

  // Pick roll mode: attack-side advantage/disadvantage dominates
  const rollMode = atkMods.mode; // simple rule; refine later if needed

  const seed = seedFromParts(ctx.seedParts);
  const r = rollD20({ seed, mode: rollMode });

  const abilityBonus = ctx.attackerAbilityBonus ?? 0;

  // Attack total
  const totalAttack = r.used + abilityBonus + atkMods.bonus;

  let target = 0;
  let targetLabel = "";

  if (ctx.opposed) {
    // Simple defense baseline (later: creature stats)
    target = 10 + (ctx.defenderDefenseBonus ?? 2) + defMods.bonus;
    targetLabel = `defense ${target}`;
  } else {
    target = dcFromHint(ctx.dcHint);
    targetLabel = `DC ${target}`;
  }

  const margin = totalAttack - target;
  const tier = tierFrom(r.used, margin);

  const debug: RollDebug | undefined = ctx.debugRoll ? {
    d20: r.d20, second: r.second, used: r.used,
    mode: rollMode,
    modsAttack: atkMods.applied,
    modsDefense: ctx.opposed ? defMods.applied : undefined,
    target: targetLabel,
    total: totalAttack,
    margin
  } : undefined;

  return { tier, margin, critical: r.used === 1 ? "nat1" : r.used === 20 ? "nat20" : undefined, debug };
}