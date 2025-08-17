// src/feeds/learned_feed.ts
import { getLearned } from "../state/learned";
import { SKILLS } from "../data/skills";
import { SPELLS } from "../data/spells";

export function learnedFeed() {
  const { skills, spells } = getLearned();

  // Tags the Rolls DM can use quickly (keeps prompts compact)
  const tags: string[] = [
    ...skills.map(id => `pc:skill:${id}`),
    ...spells.map(id => `pc:spell:${id}`),
  ];

  // Optional short lists (nice for logs or UI, not required for prompts)
  const list = {
    skills: skills.map(id => SKILLS[id]?.name ?? id),
    spells: spells.map(id => SPELLS[id]?.name ?? id),
  };

  return { tags, list };
}