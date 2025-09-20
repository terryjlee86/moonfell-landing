import { EntitySpawn } from "../encounters/types";

export function rollInitiative(actors: EntitySpawn[]): { actor: EntitySpawn; roll: number }[] {
  return actors.map(actor => ({ actor, roll: Math.floor(Math.random() * 20) + 1 }))
               .sort((a, b) => b.roll - a.roll);
}

// Example usage
if (require.main === module) {
  const exampleActors: EntitySpawn[] = [
    { kind: "creature", speciesId: "wolf", level: 1, count: 1 },
    { kind: "humanoid", raceId: "elf", roleId: "archer", faction: "alliance", level: 2, count: 1 }
  ];
  const initiativeOrder = rollInitiative(exampleActors);
  console.log("Initiative Order:", initiativeOrder);
}
