// Message/intent helpers extracted from Rolls DM.
// Keep these simple, fast, and unit-testable.

export function wantsRanged(message: string): boolean {
  return /\b(shoot|nock|loose|fire)\b/i.test(message);
}
export function mentionsBow(message: string): boolean {
  return /\b(bow|arrow|nock|loose)\b/i.test(message);
}
export function mentionsCrossbow(message: string): boolean {
  return /\b(crossbow|bolt)\b/i.test(message);
}
export function mentionsHandcannon(message: string): boolean {
  // include small variants: "hand cannon", "handcannon", "pistol", "handgun", "rifle", "musket", "cannon"
  return /\b(hand\s*cannon|handcannon|pistol|handgun|rifle|musket|cannon)\b/i.test(message);
}
export function wantsThrow(message: string): boolean {
  return /\b(throw|toss|hurl|lob)\b/i.test(message);
}
export function mentionsThrowingAxe(message: string): boolean {
  return /\b(throwing\s*axe|hand\s*axe)\b/i.test(message);
}
export function wantsRopeUse(message: string): boolean {
  // flexible phrasing; just require both an action verb and "rope"
  return /\b(tie|tether|secure|lasso|lower|climb|descend)\b/i.test(message) && /\brope\b/i.test(message);
}
export function wantsLightAction(message: string): boolean {
  return /\b(light|ignite|spark)\b/i.test(message) && /\b(torch|lantern|lamp)\b/i.test(message);
}
export function wantsToLeaveDemo(message: string): boolean {
  return /\b(leave|exit|travel|go to|head to|make for|depart|run to|walk to)\b/i.test(message);
}

export function extractRequestedSpells(message: string): string[] {
  const m = message.toLowerCase();
  const found = new Set<string>();
  const verbs = "(cast|use|conjure|invoke|unleash|channel|summon)";
  const afterVerb = new RegExp(`\\b${verbs}\\b\\s+([a-z][a-z\\-']{2,24})\\b`, "gi");

  let hit: RegExpExecArray | null;
  while ((hit = afterVerb.exec(m))) {
    const spell = hit[1];
    if (spell) found.add(spell);
  }

  // common colloquials
  if (/\bfire\s*ball\b/i.test(message)) found.add("fireball");

  return Array.from(found);
}