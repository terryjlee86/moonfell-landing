/**
 * FILE: src/data/skill_modifiers.ts
 * WHAT: Database of available skill modifiers
 * HOW: Defines all skill modifiers with their triggers, effects, and cooldowns
 */

import { SkillModifier } from "../types/skill_modifiers";

export const SKILL_MODIFIERS: SkillModifier[] = [
  {
    id: "parry",
    name: "Parry",
    description: "Deflect incoming melee attacks with your weapon",
    trigger: "when_attacked_melee",
    effect: {
      acBonus: 2,
      statusEffects: [{
        target: "attacker",
        effect: "Parried",
        duration: 1,
        modifier: -2
      }]
    },
    cooldown: 2,
    tags: ["defensive", "reaction"]
  },
  {
    id: "dodge",
    name: "Dodge",
    description: "Evade attacks with quick movement",
    trigger: "when_attacked_any",
    effect: {
      acBonus: 3,
      statusEffects: [{
        target: "defender",
        effect: "Off Balance",
        duration: 1,
        modifier: -1
      }]
    },
    cooldown: 1,
    tags: ["defensive"]
  },
  {
    id: "riposte",
    name: "Riposte",
    description: "Counter-attack after deflecting a melee strike",
    trigger: "when_attacked_melee",
    effect: {
      acBonus: 1,
      counterattack: true,
      attackBonus: -2 // penalty for counterattack
    },
    cooldown: 3,
    tags: ["defensive", "offensive", "reaction"]
  },
  {
    id: "shield_bash",
    name: "Shield Bash",
    description: "Use your shield to knock back attackers",
    trigger: "when_blocking_shield",
    effect: {
      knockback: 1,
      statusEffects: [{
        target: "attacker",
        effect: "Disoriented",
        duration: 1,
        modifier: -1
      }]
    },
    cooldown: 2,
    tags: ["defensive", "control"]
  },
  {
    id: "feint",
    name: "Feint",
    description: "Deceive your opponent with a false attack",
    trigger: "when_attacking_melee",
    effect: {
      attackBonus: 2,
      statusEffects: [{
        target: "defender",
        effect: "Feinted",
        duration: 1,
        modifier: -1
      }]
    },
    cooldown: 2,
    tags: ["offensive", "setup"]
  },
  {
    id: "counterspell",
    name: "Counterspell",
    description: "Interrupt and negate incoming spells",
    trigger: "when_attacked_spell",
    effect: {
      spellInterrupt: true,
      statusEffects: [{
        target: "attacker",
        effect: "Backlash",
        duration: 1,
        modifier: -1
      }]
    },
    cooldown: 3,
    tags: ["defensive", "magic"]
  },
  {
    id: "brace",
    name: "Brace",
    description: "Absorb heavy attacks and rebound damage",
    trigger: "when_struck_heavy",
    effect: {
      damageReduction: 3,
      statusEffects: [{
        target: "attacker",
        effect: "Rebounded",
        duration: 1,
        modifier: -2
      }]
    },
    cooldown: 2,
    tags: ["defensive", "resilience"]
  },
  {
    id: "lunge",
    name: "Lunge",
    description: "Make a powerful but risky attack",
    trigger: "when_attacking_melee",
    effect: {
      attackBonus: 2,
      statusEffects: [{
        target: "defender",
        effect: "Exposed",
        duration: 1,
        modifier: -2
      }]
    },
    cooldown: 1,
    tags: ["offensive", "risk-reward"]
  }
];
