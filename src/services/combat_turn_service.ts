import { RosterEntry, Attitude } from "../types/roster";
import { TurnEntry, CombatTurnState } from "../types/combat";

function d20(rng?: () => number): number {
  const r = rng ? rng() : Math.random();
  return Math.floor(r * 20) + 1;
}

export function rollInitiativeForRoster(entries: RosterEntry[], rng?: () => number): TurnEntry[] {
  const rolled = entries.map(actor => ({ actor, roll: d20(rng) }));
  rolled.sort((a, b) =>
    b.roll - a.roll || (a.actor.name || a.actor.kind).localeCompare(b.actor.name || b.actor.kind)
  );
  return rolled;
}

export function enterCombat(entries: RosterEntry[], rng?: () => number): { state: CombatTurnState; debugLine: string } {
  const order = rollInitiativeForRoster(entries, rng);
  const debugLine = `Initiative rolls: ${order.map(e => `${e.actor.name} = ${e.roll}`).join(", ")}`;
  return { state: { order, index: 0, round: 1, inCombat: true }, debugLine };
}

export function currentActor(state: CombatTurnState): RosterEntry | null {
  if (!state.inCombat || state.order.length === 0) return null;
  return state.order[state.index]?.actor ?? null;
}

export function advance(state: CombatTurnState): CombatTurnState {
  if (!state.inCombat || state.order.length === 0) return state;
  const nextIndex = (state.index + 1) % state.order.length;
  const wrapped = nextIndex === 0;
  return { ...state, index: nextIndex, round: wrapped ? state.round + 1 : state.round };
}

export function toNonCombatOrder(entries: RosterEntry[]): TurnEntry[] {
  return entries.map(actor => ({ actor, roll: 0 }));
}

export function isPlayerTurn(state: CombatTurnState, playerId = "player-id"): boolean {
  const a = currentActor(state);
  return !!a && a.id === playerId;
}
