/**
 * FILE: src/services/entity_ac_service.ts
 * WHAT: Service for calculating Armor Class (AC) for creatures and humanoids
 * HOW: Looks up entity stats from databases and calculates AC using deriveTargets
 */

import { CREATURE_SPECIES } from "../catalog/creature_species";
import { HUMANOID_RACES } from "../catalog/humanoid_races";
import { ROLE_TEMPLATES } from "../catalog/role_templates";
import { deriveTargets } from "../encounters/derive_targets";

export type EntityType = "creature" | "humanoid";

export type EntityACResult = {
  success: boolean;
  armorClass?: number;
  error?: string;
};

/**
 * Calculate AC for an entity based on context tags
 * @param contextTags Array of context tags (e.g., ["creature:mirefold:hostile:10m"])
 * @returns EntityACResult with calculated AC or error
 */
export function calculateEntityAC(contextTags: string[]): EntityACResult {
  // Look for entity tags in context (creature: or humanoid:)
  const entityTags = contextTags.filter(t => t.startsWith("creature:") || t.startsWith("humanoid:"));
  
  if (entityTags.length === 0) {
    return { success: false, error: "No entity tags found in context" };
  }

  const entityTag = entityTags[0];
  const [entityType, entityId] = entityTag.split(":");
  
  if (entityType === "creature") {
    return calculateCreatureAC(entityId);
  } else if (entityType === "humanoid") {
    return calculateHumanoidAC(entityId);
  } else {
    return { success: false, error: `Unknown entity type: ${entityType}` };
  }
}

/**
 * Calculate AC for a creature
 * @param creatureId Creature species ID (e.g., "mirefold")
 * @returns EntityACResult with calculated AC or error
 */
function calculateCreatureAC(creatureId: string): EntityACResult {
  // Look up creature in database
  const creature = CREATURE_SPECIES.find(c => c.id === creatureId);
  
  if (!creature) {
    return { success: false, error: `Creature not found: ${creatureId}` };
  }

  try {
    // Calculate AC using deriveTargets
    const targets = deriveTargets({
      level: 1, // Default level for now
      stats: creature.baseStats,
      profs: creature.proficiencies,
      armor: undefined, // No armor for wild creatures
      shield: false, // No shield for wild creatures
      traitMoraleMod: 0
    });
    
    return { success: true, armorClass: targets.armorClass };
  } catch (error) {
    return { success: false, error: `Failed to calculate creature AC: ${error}` };
  }
}

/**
 * Calculate AC for a humanoid
 * @param humanoidId Humanoid ID in format "raceId:roleId" (e.g., "goblin:bandit")
 * @returns EntityACResult with calculated AC or error
 */
function calculateHumanoidAC(humanoidId: string): EntityACResult {
  // Parse humanoid ID (format: "raceId:roleId")
  const [raceId, roleId] = humanoidId.split(":");
  
  if (!raceId || !roleId) {
    return { success: false, error: `Invalid humanoid ID format: ${humanoidId}. Expected "raceId:roleId"` };
  }
  
  // Look up race and role in databases
  const race = HUMANOID_RACES.find(r => r.id === raceId);
  const role = ROLE_TEMPLATES.find(r => r.id === roleId);
  
  if (!race) {
    return { success: false, error: `Race not found: ${raceId}` };
  }
  
  if (!role) {
    return { success: false, error: `Role not found: ${roleId}` };
  }

  try {
    // Calculate AC using deriveTargets
    const targets = deriveTargets({
      level: 1, // Default level for now
      stats: race.baseStats,
      profs: role.profMods || {}, // Use profMods from role template, fallback to empty object
      armor: "leather", // Default armor for humanoids
      shield: false, // Default no shield
      traitMoraleMod: 0
    });
    
    return { success: true, armorClass: targets.armorClass };
  } catch (error) {
    return { success: false, error: `Failed to calculate humanoid AC: ${error}` };
  }
}

/**
 * Get default AC for fallback cases
 * @returns Default AC value (Base AC = 9)
 */
export function getDefaultAC(): number {
  return 9;
}
