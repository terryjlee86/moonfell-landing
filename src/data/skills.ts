// src/data/skills.ts
export type Skill = {
  id: string;
  name: string;
  group: "combat" | "craft" | "social" | "stealth" | "survival" | "arcana";
  description: string; // short, author-facing
};

export const SKILLS: Record<string, Skill> = {
  melee:   { id: "melee",   name: "Melee",   group: "combat",  description: "Close-quarters strikes, blocks, counters." },
  ranged:  { id: "ranged",  name: "Ranged",  group: "combat",  description: "Thrown and missile accuracy and handling." },
  stealth: { id: "stealth", name: "Stealth", group: "stealth", description: "Move quietly, hide, pick pockets." },
  survival:{ id: "survival",name: "Survival",group: "survival",description: "Track, forage, weather signs, snares." },
  arcana:  { id: "arcana",  name: "Arcana",  group: "arcana",  description: "Scholarly magic theory, glyphs, reagents." },
  social:  { id: "social",  name: "Social",  group: "social",  description: "Persuade, intimidate, bargain, command." },
};