/**
 * FILE: src/encounters/types.ts
 * WHAT: Types for encounter generation (inputs, blueprint, entity spawns).
 * HOW: Pure interfaces shared by manager + composer + filters.
 */

import { Activity, Biome } from "../catalog/types";

export interface EncounterInputs {
  playerLevel: number;
  context: {
    biome: Biome; timeOfDay: Activity; weather?: string;
    railTags?: string[]; regionId: string; hexId: string;
    lastEncounterAt?: number; desiredDensity: "low"|"med"|"high";
  };
  toggles?: { debug?: boolean; seed?: number };
}

export type Severity = "ambient" | "social" | "standard" | "hard" | "deadly" | "hazard";
export type Mode = "combat" | "social" | "hazard" | "mixed";

export type EntitySpawn =
  | { kind:"creature"; speciesId:string; level:number; count:number; tags?:string[] }
  | { kind:"humanoid"; raceId:string; roleId:string; level:number; count:number; faction?:string; tags?:string[] };

export interface DerivedTargets {
  melee:number; ranged:number; perception:number; morale:number;
}

export interface EncounterBlueprint {
  id: string; seed: number;
  mode: Mode; severity: Severity; intent: string;
  locationHints: string[];
  composition: EntitySpawn[]; // who spawns
  targets: Record<string, DerivedTargets>; // frozen derived defenses for this instance
  deltas: string[]; // feed mutations (context entries)
}