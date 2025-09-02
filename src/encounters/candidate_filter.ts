/**
 * FILE: src/encounters/candidate_filter.ts
 * WHAT: Build a candidate set from catalogues based on biome/time/severity & cohesion.
 * HOW: Filters to creatures/humanoids valid in context; returns small structs for compose().
 */

import { Activity, Biome } from "../catalog/types";
import { HUMANOID_RACES } from "../catalog/humanoid_races";
import { ROLE_TEMPLATES } from "../catalog/role_templates";
import { CREATURE_SPECIES } from "../catalog/creature_species";

export type Candidate =
  | { kind:"creature"; speciesId:string; wild:boolean; cohortKey:string; cost:number; baseLevelBias:number; meta:any }
  | { kind:"humanoid"; raceId:string; roleId:string; faction?:string; cohortKey:string; cost:number; baseLevelBias:number; meta:any };

export function filterCandidates(ctx: {
  biome: Biome; timeOfDay: Activity; severityWindow:[number,number]; playerLevel:number;
}) : Candidate[] {
  const [minL, maxL] = ctx.severityWindow;

  const creatures: Candidate[] = CREATURE_SPECIES
    .filter(s => s.biomes.includes(ctx.biome) && (s.activity === "any" || s.activity === ctx.timeOfDay))
    .map(s => ({
      kind:"creature" as const,
      speciesId: s.id,
      wild: s.wild,
      cohortKey: s.wild ? `wild:${s.socialCohort ?? s.id}` : `tame:${s.socialCohort ?? s.id}`,
      cost: 1, // tiny, human-tunable; composer will adjust by level
      baseLevelBias: 0,
      meta: s
    }));

  const humanoids: Candidate[] = ROLE_TEMPLATES.flatMap(role =>
    HUMANOID_RACES.map(race => ({
      kind:"humanoid" as const,
      raceId: race.id,
      roleId: role.id,
      faction: role.faction,
      cohortKey: role.faction ? `faction:${role.faction}` : `role:${role.id}`,
      cost: 1,
      baseLevelBias: 0,
      meta: { race, role }
    }))
  );

  // Simple windowing: leave level clamping to composer (it picks exact level).
  return [...creatures, ...humanoids];
}