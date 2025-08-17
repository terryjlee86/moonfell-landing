// src/feeds/character_feed.ts
import { getCharacter } from "../state/character";

export function characterFeed() {
  const c = getCharacter();

  // Compact, prompt-safe summary of player state
  return {
    name: c.name,
    stance: c.stance ?? "neutral",
    stats: c.stats,
    activeConditions: Object.keys(c.conditions).filter(
      (k) => (c.conditions as any)[k] === true
    ),
  };
}