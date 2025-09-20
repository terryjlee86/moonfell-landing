/**
 * FILE: src/examples/skill_modifier_usage.ts
 * WHAT: Example usage of the skill modifiers system
 * HOW: Demonstrates how to set, trigger, and manage skill modifiers
 */

import { SkillModifierService } from "../services/skill_modifier_service";
import { calculateEntityAC } from "../services/entity_ac_service";

// Example: Player sets Parry on their turn
export function exampleSetParry() {
  const skillService = new SkillModifierService();
  const currentTurn = 1;
  
  // Player decides to set Parry as their active skill
  const result = skillService.setActiveSkill("parry", currentTurn);
  
  if (result.success) {
    console.log("Parry is now active and ready to trigger!");
  } else {
    console.error(`Failed to set Parry: ${result.error}`);
  }
  
  return skillService;
}

// Example: Player is attacked and Parry triggers
export function exampleParryTrigger(skillService: SkillModifierService) {
  const currentTurn = 2;
  
  // Check if Parry should trigger when attacked in melee
  const triggerResult = skillService.checkTrigger("when_attacked_melee", currentTurn);
  
  if (triggerResult.triggered) {
    console.log(`${triggerResult.skillName} triggered!`);
    console.log(`Effects:`, triggerResult.effects);
    
    // The effect would be:
    // - +2 AC bonus for this attack
    // - If attack misses, attacker gets "Parried" status (-2 to attack rolls for 1 round)
    
    return true;
  }
  
  return false;
}

// Example: Calculate AC with skill modifiers
export function exampleACWithSkills() {
  const contextTags = ["creature:mirefold:hostile:10m"];
  const skillService = new SkillModifierService();
  
  // Set Dodge as active skill
  skillService.setActiveSkill("dodge", 1);
  
  // Calculate AC with skill modifier bonus
  const acResult = calculateEntityAC(contextTags, skillService, "when_attacked_any");
  
  if (acResult.success) {
    console.log(`Base AC: ${acResult.armorClass! - (acResult.skillModifiers?.acBonus || 0)}`);
    console.log(`Skill Bonus: +${acResult.skillModifiers?.acBonus || 0}`);
    console.log(`Final AC: ${acResult.armorClass}`);
    
    if (acResult.skillModifiers?.activeSkill) {
      console.log(`Active Skill: ${acResult.skillModifiers.activeSkill}`);
    }
  }
  
  return acResult;
}

// Example: Get available skills
export function exampleGetAvailableSkills() {
  const skillService = new SkillModifierService();
  const currentTurn = 1;
  
  // Get all available skills (not on cooldown)
  const availableSkills = skillService.getAvailableSkills(currentTurn);
  
  console.log("Available skills:");
  availableSkills.forEach(skill => {
    console.log(`- ${skill.name}: ${skill.description} (Cooldown: ${skill.cooldown} rounds)`);
  });
  
  return availableSkills;
}

// Example: Get defensive skills only
export function exampleGetDefensiveSkills() {
  const skillService = new SkillModifierService();
  const currentTurn = 1;
  
  // Get only defensive skills
  const defensiveSkills = skillService.getSkillsByTag("defensive", currentTurn);
  
  console.log("Defensive skills:");
  defensiveSkills.forEach(skill => {
    console.log(`- ${skill.name}: ${skill.description}`);
  });
  
  return defensiveSkills;
}

// Example: Complete combat flow
export function exampleCombatFlow() {
  console.log("=== Combat Flow Example ===");
  
  // Turn 1: Player sets Parry
  const skillService = exampleSetParry();
  
  // Turn 2: Player is attacked, Parry triggers
  const parryTriggered = exampleParryTrigger(skillService);
  
  if (parryTriggered) {
    console.log("Parry successfully deflected the attack!");
    console.log("Parry is now on cooldown for 2 rounds.");
  }
  
  // Turn 3: Player tries to set Parry again (should fail - on cooldown)
  const cooldownResult = skillService.setActiveSkill("parry", 3);
  if (!cooldownResult.success) {
    console.log(`Cannot set Parry: ${cooldownResult.error}`);
  }
  
  // Turn 4: Parry is available again
  const availableSkills = skillService.getAvailableSkills(4);
  const parryAvailable = availableSkills.some(skill => skill.id === "parry");
  console.log(`Parry available on turn 4: ${parryAvailable}`);
  
  return skillService;
}
