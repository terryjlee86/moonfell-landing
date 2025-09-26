// src/types/combat.ts
// Combat-related types to avoid circular dependencies

import { RosterEntry } from "./roster";

export type TurnEntry = { actor: RosterEntry; roll: number };
export type CombatTurnState = {
  order: TurnEntry[];
  index: number;
  round: number;
  inCombat: boolean;
};
