/**
 * FILE: src/catalog/humanoid_races.ts
 * WHAT: Seed definitions for humanoid races (anatomy + profs), not jobs.
 * HOW: Export a constant array; Encounter system composes race + role at runtime.
 */

import { HumanoidRace } from "./types";

export const HUMANOID_RACES: HumanoidRace[] = [
  {
    id:"goblin", name:"Goblin", size:"small",
    baseStats:{STR:2,AGI:4,END:2,INT:1,WIL:2,CHA:1},
    proficiencies:{melee:1,ranged:1,stealth:2,perception:1},
    languages:["Low Common"], biomes:["forest","caves"], activity:"any"
  },
  // add more races…
];