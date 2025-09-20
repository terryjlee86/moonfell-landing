/**
 * FILE: src/encounters/derive_targets.ts
 * WHAT: Small pure math to convert base stats + profs + level into target defenses.
 * HOW: Level-only scaling; engines remain simple. Dice stays pure RNG elsewhere.
 */

import { Profs, Stats } from "../catalog/types";
import { DerivedTargets } from "./types";

const ARMOR_TABLE = { cloth:0, leather:1, studded:2, chain:3, plate:5 } as const;

function mod(stat:number){ return stat - 2; } // stat 0..5 → mod -2..+3
function lvlBonus(level:number){ return Math.floor(level/3); }

export function deriveTargets(params: {
  level: number;
  stats: Stats;
  profs: Profs;
  armor?: keyof typeof ARMOR_TABLE;
  shield?: boolean;
  traitMoraleMod?: number;
}): DerivedTargets {
  const { level, stats, profs, armor, shield, traitMoraleMod=0 } = params;
  const lb = lvlBonus(level);
  const armorBonus = armor ? ARMOR_TABLE[armor] : 0;
  const shieldBonus = shield ? 2 : 0;

  const melee = 10 + armorBonus + shieldBonus + Math.max(mod(stats.AGI), mod(stats.END)) + (profs.melee ?? 0) + lb;
  const ranged = 10 + armorBonus +               Math.max(0, mod(stats.AGI))              + (profs.ranged ?? 0) + lb;
  const perception = 10 + mod(stats.WIL) + (profs.perception ?? 0) + lb;
  const morale = 10 + Math.max(mod(stats.WIL), mod(stats.CHA)) + traitMoraleMod + lb;
  const armorClass = 10 + armorBonus + shieldBonus + mod(stats.AGI); // Calculate AC

  return { melee, ranged, perception, morale };
}