/**
 * FILE: src/services/skill_modifier_service.ts
 * WHAT: Service for managing active skill modifiers and cooldowns
 * HOW: Handles setting, triggering, and cooldown management of skill modifiers
 */

import { SkillModifier, ActiveSkillModifier, SkillModifierState, SkillModifierTrigger } from "../types/skill_modifiers";
import { SKILL_MODIFIERS } from "../data/skill_modifiers";

export class SkillModifierService {
  private state: SkillModifierState;

  constructor(initialState?: Partial<SkillModifierState>) {
    this.state = {
      active: null,
      cooldowns: {},
      ...initialState
    };
  }

  /**
   * Set an active skill modifier for the next trigger
   */
  setActiveSkill(skillId: string, currentTurn: number): { success: boolean; error?: string } {
    const skill = SKILL_MODIFIERS.find(s => s.id === skillId);
    if (!skill) {
      return { success: false, error: `Skill not found: ${skillId}` };
    }

    // Check if skill is on cooldown
    if (this.state.cooldowns[skillId] && this.state.cooldowns[skillId] > currentTurn) {
      return { success: false, error: `Skill ${skill.name} is on cooldown until turn ${this.state.cooldowns[skillId]}` };
    }

    // Set the active skill
    this.state.active = {
      skillId,
      setOnTurn: currentTurn,
      triggered: false
    };

    return { success: true };
  }

  /**
   * Check if a skill modifier should trigger and apply its effects
   */
  checkTrigger(trigger: SkillModifierTrigger, currentTurn: number): {
    triggered: boolean;
    effects?: SkillModifier["effect"];
    skillName?: string;
  } {
    if (!this.state.active || this.state.active.triggered) {
      return { triggered: false };
    }

    const skill = SKILL_MODIFIERS.find(s => s.id === this.state.active!.skillId);
    if (!skill || skill.trigger !== trigger) {
      return { triggered: false };
    }

    // Mark as triggered and set cooldown
    this.state.active.triggered = true;
    this.state.active.cooldownUntil = currentTurn + skill.cooldown;
    this.state.cooldowns[skill.id] = currentTurn + skill.cooldown;

    // Clear active skill
    this.state.active = null;

    return {
      triggered: true,
      effects: skill.effect,
      skillName: skill.name
    };
  }

  /**
   * Get current AC bonus from active skill modifiers
   */
  getACBonus(trigger: SkillModifierTrigger): number {
    if (!this.state.active || this.state.active.triggered) {
      return 0;
    }

    const skill = SKILL_MODIFIERS.find(s => s.id === this.state.active!.skillId);
    if (!skill || skill.trigger !== trigger) {
      return 0;
    }

    return skill.effect.acBonus || 0;
  }

  /**
   * Get current attack bonus from active skill modifiers
   */
  getAttackBonus(trigger: SkillModifierTrigger): number {
    if (!this.state.active || this.state.active.triggered) {
      return 0;
    }

    const skill = SKILL_MODIFIERS.find(s => s.id === this.state.active!.skillId);
    if (!skill || skill.trigger !== trigger) {
      return 0;
    }

    return skill.effect.attackBonus || 0;
  }

  /**
   * Get available skills (not on cooldown)
   */
  getAvailableSkills(currentTurn: number): SkillModifier[] {
    return SKILL_MODIFIERS.filter(skill => 
      !this.state.cooldowns[skill.id] || this.state.cooldowns[skill.id] <= currentTurn
    );
  }

  /**
   * Get skills by tag
   */
  getSkillsByTag(tag: string, currentTurn?: number): SkillModifier[] {
    let skills = SKILL_MODIFIERS.filter(skill => skill.tags.includes(tag as any));
    
    if (currentTurn !== undefined) {
      skills = skills.filter(skill => 
        !this.state.cooldowns[skill.id] || this.state.cooldowns[skill.id] <= currentTurn
      );
    }
    
    return skills;
  }

  /**
   * Get current state
   */
  getState(): SkillModifierState {
    return { ...this.state };
  }

  /**
   * Update state (for persistence)
   */
  setState(newState: SkillModifierState): void {
    this.state = { ...newState };
  }

  /**
   * Clear active skill (for turn end or manual clearing)
   */
  clearActiveSkill(): void {
    this.state.active = null;
  }

  /**
   * Get active skill info
   */
  getActiveSkill(): { skill: SkillModifier | null; turnsRemaining: number } {
    if (!this.state.active) {
      return { skill: null, turnsRemaining: 0 };
    }

    const skill = SKILL_MODIFIERS.find(s => s.id === this.state.active!.skillId);
    return { 
      skill: skill || null, 
      turnsRemaining: this.state.active.triggered ? 0 : 1 
    };
  }
}
