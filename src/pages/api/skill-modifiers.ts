/**
 * FILE: src/pages/api/skill-modifiers.ts
 * WHAT: API endpoint for managing skill modifiers
 * HOW: Handles setting active skills and getting available skills
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getCharacter, setCharacter } from "../../state/character";
import { SkillModifierService } from "../../services/skill_modifier_service";
import { SKILL_MODIFIERS } from "../../data/skill_modifiers";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, skillId, currentTurn } = req.body;

  if (!action) {
    return res.status(400).json({ error: "Action is required" });
  }

  const char = getCharacter();
  const skillService = new SkillModifierService(char.skillModifiers);

  try {
    switch (action) {
      case "set_active":
        if (!skillId) {
          return res.status(400).json({ error: "skillId is required for set_active" });
        }
        
        const turn = currentTurn || 1; // Default to turn 1 if not provided
        const result = skillService.setActiveSkill(skillId, turn);
        
        if (result.success) {
          // Update character state
          setCharacter({ skillModifiers: skillService.getState() });
          return res.status(200).json({ 
            success: true, 
            message: `Active skill set to ${skillId}`,
            activeSkill: skillService.getActiveSkill()
          });
        } else {
          return res.status(400).json({ error: result.error });
        }

      case "get_available":
        const turnForAvailable = currentTurn || 1;
        const availableSkills = skillService.getAvailableSkills(turnForAvailable);
        return res.status(200).json({ 
          success: true, 
          availableSkills: availableSkills.map(skill => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            cooldown: skill.cooldown,
            tags: skill.tags
          }))
        });

      case "get_active":
        const activeSkill = skillService.getActiveSkill();
        return res.status(200).json({ 
          success: true, 
          activeSkill 
        });

      case "clear_active":
        skillService.clearActiveSkill();
        setCharacter({ skillModifiers: skillService.getState() });
        return res.status(200).json({ 
          success: true, 
          message: "Active skill cleared" 
        });

      case "get_all":
        return res.status(200).json({ 
          success: true, 
          skills: SKILL_MODIFIERS.map(skill => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            trigger: skill.trigger,
            cooldown: skill.cooldown,
            tags: skill.tags,
            effect: skill.effect
          }))
        });

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error("Skill modifier API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
