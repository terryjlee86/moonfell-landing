/**
 * FILE: src/types/skill_modifiers.ts
 * WHAT: TypeScript types for skill modifiers system
 * HOW: Defines the structure for active combat techniques with triggers, effects, and cooldowns
 */

export type SkillModifierTrigger = 
  | "when_attacked_melee"
  | "when_attacked_any"
  | "when_attacked_ranged"
  | "when_attacked_spell"
  | "when_attacking_melee"
  | "when_attacking_ranged"
  | "when_blocking_shield"
  | "when_struck_heavy";

export type SkillModifierTag = 
  | "defensive"
  | "offensive" 
  | "reaction"
  | "control"
  | "setup"
  | "magic"
  | "resilience"
  | "risk-reward";

export type SkillModifierEffect = {
  // AC modifications
  acBonus?: number;
  
  // Attack modifications
  attackBonus?: number;
  
  // Damage modifications
  damageReduction?: number;
  damageBonus?: number;
  
  // Status effects applied to attacker/target
  statusEffects?: {
    target: "attacker" | "defender";
    effect: string; // e.g., "Parried", "Disoriented", "Backlash"
    duration: number; // rounds
    modifier?: number; // e.g., -2 to attack rolls
  }[];
  
  // Special effects
  counterattack?: boolean;
  spellInterrupt?: boolean;
  knockback?: number; // meters
};

export interface SkillModifier {
  id: string;
  name: string;
  description: string;
  trigger: SkillModifierTrigger;
  effect: SkillModifierEffect;
  cooldown: number; // rounds
  tags: SkillModifierTag[];
}

export type ActiveSkillModifier = {
  skillId: string;
  setOnTurn: number;
  triggered: boolean;
  cooldownUntil?: number;
};

export type SkillModifierState = {
  active: ActiveSkillModifier | null;
  cooldowns: Record<string, number>; // skillId -> cooldownUntil
};
