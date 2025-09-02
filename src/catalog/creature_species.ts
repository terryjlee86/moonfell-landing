/**
 * FILE: src/catalog/creature_species.ts
 * WHAT: Authoritative list of wild/non-classed creatures with ecology flags.
 * HOW: Encounter composer filters by biome/time and uses cohesion rules to group.
 */

import { CreatureSpecies } from "./types";

export const CREATURE_SPECIES: CreatureSpecies[] = [
  {
    id:"wolf", name:"Wolf", size:"medium",
    baseStats:{STR:3,AGI:4,END:3,INT:1,WIL:2,CHA:1},
    proficiencies:{melee:2,perception:1,stealth:1},
    traits:["pack-tactics"],
    naturalAttacks:["bite:light:piercing"],
    biomes:["forest","hills"], activity:"night",
    wild:true, packHunter:true, communal:false, solitary:false, socialCohort:"wolves"
  },
  {
    id:"boar", name:"Boar", size:"medium",
    baseStats:{STR:4,AGI:2,END:4,INT:1,WIL:2,CHA:1},
    proficiencies:{melee:2,perception:1},
    traits:["thick-hide"],
    naturalAttacks:["gore:medium:piercing"],
    biomes:["forest","hills"], activity:"day",
    wild:true, packHunter:false, communal:true, solitary:false, socialCohort:"boar"
  },
  {
    id:"guard-dog", name:"Guard Dog", size:"medium",
    baseStats:{STR:3,AGI:3,END:3,INT:1,WIL:2,CHA:1},
    proficiencies:{melee:2,perception:1},
    traits:["loyal"],
    naturalAttacks:["bite:light:piercing"],
    biomes:["road","ruins","forest"], activity:"any",
    wild:false, packHunter:true, communal:false, solitary:false, socialCohort:"dogs"
  },
  // add more creatures…
];