// src/prompts/scenarios/forest_ambush.ts
export type StartItem = {
  id: string;
  name: string;
  where: "main" | "off" | "belt" | "pack" | "ground";
  qty?: number;
  tags: Array<
    | "weapon:melee"
    | "weapon:ranged"
    | "shield"
    | "throwable"
    | "light"
    | "healing"
    | "rope"
  >;
  lit?: boolean; // only relevant for "light"
};

export type Scenario = {
  id: string;
  title: string;
  introForPlayer: string;    // shown to the tester on first load (keep generic so it never lies)
  refereeBrief: string;      // hidden context for the model
  boundaries: string[];      // hard rails to keep them inside the demo
  // NEW: the scenario's intended starting kit (authoritative source of truth)
  startKit?: StartItem[];
};

const scenario: Scenario = {
  id: "forest_ambush",
  title: "Forest Ambush on the Gorge Path",
  // Keep intro generic; we'll show/derive actual kit at init from startKit
  introForPlayer: `
You’re on a narrow path skirting a gorge. Evening light. A goblin lookout clings to the ledge ahead.
You’ve got your travel pack and whatever the terrain offers. Type exactly what you want to do.
(Preview is short: you can’t leave the gorge path area in this demo.)
  `.trim(),
  refereeBrief: `
Keep the tester inside a tight area: path, ledge, fallen oak, rope bridge anchor.
No broader map travel, no town fast-forwards. Treat attempts to leave as time-consuming and redirect back.
Use concise, evocative outputs (6–10 lines). Check plausibility using stats/time/distance/terrain.
Allow clever environment uses (leverage, bracing, rope, stones). Lethal failures can occur (permadeath ends run).
  `.trim(),
  boundaries: [
    "If the player attempts to leave the gorge area, redirect and explain the demo is limited to the ambush zone.",
    "No visiting towns, cities, or other biomes in this preview.",
    "Keep the timeline short (minutes), not days.",
  ],

  // NEW: start kit (matches the player gear we actually seed)
  startKit: [
    // Equipped (hands/belt)
    { id: "longsword",    name: "Iron Longsword", where: "main", tags: ["weapon:melee"] },
    { id: "buckler",      name: "Buckler",        where: "off",  tags: ["shield"] },
    { id: "belt-knife",   name: "Belt Knife",     where: "belt", tags: ["weapon:melee"] },
    { id: "throwing-axe", name: "Throwing Axe",   where: "belt", qty: 1, tags: ["throwable","weapon:ranged"] },
    { id: "torch",        name: "Torch",          where: "belt", qty: 1, tags: ["light"], lit: false },

    // Pack items
    { id: "bandage",      name: "Basic Bandages", where: "pack", qty: 2, tags: ["healing"] },
    { id: "twine",        name: "Twine (10m)",    where: "pack",        tags: ["rope"] },

    // Ground (none at start — the observer and gameplay can add env items later)
  ],
};

export default scenario;