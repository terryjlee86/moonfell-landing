/**
 * FILE: src/catalog/types.ts
 * WHAT: Strong types for the authoring catalogues (races, roles, creatures).
 * HOW: Pure TypeScript interfaces with no logic; imported by seeds and encounter code.
 */

export type Size = "tiny" | "small" | "medium" | "large" | "extra large";
export type Biome = "forest" | "hills" | "caves" | "ruins" | "road" | "marsh" | "desert" | "coast";
export type Activity = "day" | "night" | "any";
export type Ability = "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA";

export interface Stats { STR:number; AGI:number; END:number; INT:number; WIL:number; CHA:number; }
export interface Profs { melee?:number; ranged?:number; stealth?:number; perception?:number; }

export interface Gear {
  armor?: "cloth" | "leather" | "studded" | "chain" | "plate";
  shield?: boolean;
  weapons: string[]; // canonical ids (e.g. "shortsword", "shortbow")
}

export interface HumanoidRace {
  id: string; name: string; size: Size;
  baseStats: Stats; proficiencies: Profs;
  languages?: string[];
  biomes?: Biome[]; activity?: Activity;
}

export interface RoleTemplate {
  id: string; name: string;
  defaultGear: Gear;
  profMods?: Profs;                // small bumps like +1 melee, +1 stealth
  behavior: string[];              // e.g., ["ambush","flee-when-outnumbered"]
  faction?: string;                // used to group humanoids into coherent teams
  alliances?: string[];            // optional cross-faction cooperation
  handlerOf?: string[];            // species ids they can legally bring (e.g., "guard-dog")
}

export interface CreatureSpecies {
  id: string; name: string; size: Size;
  baseStats: Stats; proficiencies: Profs;
  traits?: string[];               // e.g., ["pack-tactics","thick-hide"]
  naturalAttacks: string[];        // e.g., ["bite:light:piercing"]
  biomes: Biome[]; activity: Activity;

  // Ecology/cohesion (prevents “zoo fights”)
  wild: boolean;
  packHunter?: boolean;
  communal?: boolean;
  solitary?: boolean;
  socialCohort?: string;           // grouping key, e.g., "wolves" or "boar"
  mixedAllowedWith?: string[];     // rare ecological pairings
}