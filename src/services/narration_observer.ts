// src/services/narration_observer.ts
//
// Reads narrator text and proposes environment deltas for generic, plausible items.
// Conservative: only generic affordances (rocks/stones, branches/sticks, torches/rope).
// Does NOT promote manufactured gear or oddities (e.g. seashells).

export type EnvDelta =
  | { type: "environment"; op: "add"; slug: string; name?: string; where: "ground" | "feature"; qty?: number; tags?: string[] }
  | { type: "environment"; op: "remove"; slug: string; where: "ground" | "feature"; qty?: number }
  | { type: "environment"; op: "move"; slug: string; from: "ground" | "feature"; to: "ground" | "feature"; qty?: number };

type Options = {
  narration: string;
  sceneTags: string[];  // if you later add biome tags, you can consult them here
};

export async function proposeEnvDeltas({ narration, sceneTags }: Options): Promise<EnvDelta[]> {
  const text = (narration || "").toLowerCase();

  // Simple guards: do not promote seashells or manufactured gear.
  const banned = /\b(sea\s*shell|seashell|gun|pistol|hand\s*cannon|musket|rifle|grenade)\b/;
  if (banned.test(text)) return [];

  const deltas: EnvDelta[] = [];

  // Heuristic helpers
  const has = (re: RegExp) => re.test(text);
  const add = (slug: string, name: string, where: "ground" | "feature", qty = 1, tags: string[] = []) =>
    deltas.push({ type: "environment", op: "add", slug, name, where, qty, tags });

  // Rocks / stones / pebbles on the ground
  if (has(/\b(rock|rocks|stone|stones|pebble|pebbles)\b/)) {
    add("rock", "Rock", "ground", 1, ["improv", "throwable"]);
  }

  // Branches / sticks on the ground
  if (has(/\b(branch|branches|stick|sticks)\b/)) {
    add("branch", "Branch", "ground", 1, ["improv"]);
  }

  // Rope (lying around / feature) — very conservative
  if (has(/\b(coil of rope|rope coil|loose rope|rope on (?:the )?ground)\b/)) {
    add("rope", "Rope", "ground", 1, ["rope"]);
  }

  // Torches/lanterns fixed to features (e.g., “torches line the wall”)
  if (has(/\b(torch|torches|lantern|lanterns)\b/)) {
    // If text mentions walls/posts, prefer feature; else ground is fine
    const featureHint = /\b(on the wall|on a wall|sconce|post|mounted)\b/.test(text);
    add("torch", "Torch", featureHint ? "feature" : "ground", 1, ["light"]);
  }

  return deltas;
}