/**
 * FILE: src/encounters/index.ts
 * WHAT: Barrel export for the encounter generation API.
 * HOW: Re-exports public types + maybeSpawnEncounter for easy import.
 */

export * from "./types";
export { maybeSpawnEncounter } from "./encounter_manager";