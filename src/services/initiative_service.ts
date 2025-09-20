import { EntitySpawn } from "../encounters/types";

export function rollInitiative(actors: EntitySpawn[]): { actor: EntitySpawn; roll: number }[] {
  return actors.map(actor => ({ actor, roll: Math.floor(Math.random() * 20) + 1 }))
               .sort((a, b) => b.roll - a.roll);
}
