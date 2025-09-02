/**
 * FILE: src/encounters/cohesion_rules.ts
 * WHAT: Cohesion helpers to keep enemy groups believable (no random “zoo fights”).
 * HOW: Returns a cohortKey for candidates; filters incompatible mixes by ecology/faction.
 */

export function cohortKeyWild(speciesId: string, socialCohort?: string) {
  return `wild:${socialCohort ?? speciesId}`;
}
export function cohortKeyFaction(faction: string) {
  return `faction:${faction}`;
}

/** true if speciesB is allowed to mix with speciesA (rare ecological exception). */
export function isEcologyException(allowList: string[] | undefined, speciesId: string) {
  return !!allowList?.includes(speciesId);
}