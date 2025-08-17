// src/data/spells.ts
export type Spell = {
  id: string;
  name: string;
  school: "Fire" | "Water" | "Earth" | "Air" | "Aether";
  tier: "Minor" | "Moderate" | "Major";
  type: "quick" | "ritual";
  note?: string; // author-facing
};

export const SPELLS: Record<string, Spell> = {
  sootheTone: { id: "sootheTone", name: "Soothe Tone", school: "Air", tier: "Minor", type: "quick", note: "Softens mood; fragile effect." },
  sparkLight: { id: "sparkLight", name: "Spark Light", school: "Fire", tier: "Minor", type: "quick", note: "Ignite tinder or torch." },
  stoneBrace: { id: "stoneBrace", name: "Stone Brace", school: "Earth", tier: "Minor", type: "quick", note: "Brief stability vs shove." },
  wardCircle: { id: "wardCircle", name: "Ward Circle", school: "Aether", tier: "Moderate", type: "ritual", note: "Protective glyph ring." },
};