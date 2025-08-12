// src/prompts/scenarios/forest_ambush.ts
export type Scenario = {
  id: string;
  title: string;
  introForPlayer: string;    // shown to the tester on first load
  refereeBrief: string;      // hidden context for the model
  boundaries: string[];      // hard rails to keep them inside the demo
};

const scenario: Scenario = {
  id: "forest_ambush",
  title: "Forest Ambush on the Gorge Path",
  introForPlayer: `
You’re on a narrow path skirting a gorge. Evening light. A goblin lookout clings to the ledge ahead. 
You’ve got a travel pack, a belt knife, and whatever the terrain offers. Type exactly what you want to do.
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
};

export default scenario;
