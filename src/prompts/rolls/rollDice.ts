// src/services/rollDice.ts

// ---------- Types ----------

// Result of a fixed DC check
export type FixedResult = {
  roll: number;
  total: number;
  dc: number;
  pass: boolean;
  critical?: "nat1" | "nat20";
};

// Result of an opposed check
export type OpposedResult = {
  attackerRoll: number;
  attackerTotal: number;
  defenderRoll: number;
  defenderTotal: number;
  outcome: "attacker_wins" | "defender_wins";
  critical?:
    | "attacker_nat20"
    | "attacker_nat1"
    | "defender_nat20"
    | "defender_nat1";
};

// ---------- Stub Functions ----------

// Fixed DC roll: ability + d20 vs DC
export function rollFixed(
  abilityMod: number,
  dc: number,
  situationalMod: number = 0
): FixedResult {
  // TODO: implement dice logic
  return {
    roll: 0,
    total: 0,
    dc,
    pass: false,
    critical: undefined,
  };
}

// Opposed roll: attacker vs defender
export function rollOpposed(
  attackerMod: number,
  defenderMod: number,
  situationalA: number = 0,
  situationalD: number = 0
): OpposedResult {
  // TODO: implement dice logic
  return {
    attackerRoll: 0,
    attackerTotal: 0,
    defenderRoll: 0,
    defenderTotal: 0,
    outcome: "defender_wins",
    critical: undefined,
  };
}