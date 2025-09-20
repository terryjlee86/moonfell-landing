/**
 * FILE: src/catalog/creature_species.ts
 * WHAT: Authoritative list of wild/non-classed creatures with ecology flags.
 * HOW: Encounter composer filters by biome/time and uses cohesion rules to group.
 */

import { CreatureSpecies } from "./types";

export const CREATURE_SPECIES: CreatureSpecies[] = [
  {
    id:"wolf", name:"Wolf", size:"medium",
    baseStats:{STR:12,AGI:14,END:12,INT:8,WIL:10,CHA:8},
    proficiencies:{melee:2,perception:1,stealth:1},
    traits:["pack-tactics"],
    naturalAttacks:["bite:light:piercing"],
    biomes:["forest","hills"], activity:"night",
    wild:true, packHunter:true, communal:false, solitary:false, socialCohort:"wolves"
  },
  {
    id:"boar", name:"Boar", size:"medium",
    baseStats:{STR:16,AGI:10,END:16,INT:8,WIL:10,CHA:8},
    proficiencies:{melee:2,perception:1},
    traits:["thick-hide"],
    naturalAttacks:["gore:medium:piercing"],
    biomes:["forest","hills"], activity:"day",
    wild:true, packHunter:false, communal:true, solitary:false, socialCohort:"boar"
  },
  {
    id:"guard-dog", name:"Guard Dog", size:"medium",
    baseStats:{STR:12,AGI:12,END:12,INT:8,WIL:10,CHA:8},
    proficiencies:{melee:2,perception:1},
    traits:["loyal"],
    naturalAttacks:["bite:light:piercing"],
    biomes:["road","ruins","forest"], activity:"any",
    wild:false, packHunter:true, communal:false, solitary:false, socialCohort:"dogs"
  },
  {
    id: "mirefold",
    name: "Mirefold",
    size: "medium",
    baseStats: { STR: 12, AGI: 12, END: 12, INT: 8, WIL: 10, CHA: 8 },
    proficiencies: { melee: 1, perception: 1 },
    traits: ["amphibious", "camouflage"],
    naturalAttacks: ["claw:light:slashing"],
    biomes: ["forest", "marsh"],
    activity: "any",
    wild: true,
    packHunter: false,
    communal: false,
    solitary: true,
    socialCohort: "mirefolds"
  },
  // add more creatures…
];