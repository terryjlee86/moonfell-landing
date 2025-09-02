// src/services/narration_observer.ts
//
// AI Observer: reads narrator prose and proposes environment deltas (add/move/remove)
// without language- or item-specific hardcoding. A small normalization layer collapses
// common synonyms to canonical slugs so feeds stay consistent (e.g., rock/pebble → stone).

export type EnvDelta =
  | { type: "environment"; op: "add"; slug: string; name?: string; where: "ground" | "feature"; qty?: number; tags?: string[] }
  | { type: "environment"; op: "remove"; slug: string; where: "ground" | "feature"; qty?: number }
  | { type: "environment"; op: "move"; slug: string; from: "ground" | "feature"; to: "ground" | "feature"; qty?: number };

type Options = {
  narration: string;
  sceneTags: string[];
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OBSERVER_MODEL = process.env.OPENAI_OBSERVER_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---------------- internal helpers ----------------

function clamp(text: string, max = 8000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n...[trimmed]..." : text;
}

function fallback(): EnvDelta[] {
  return [];
}

// Normalize a free-form slug to a canonical, machine-stable token used in feeds.
// Rules:
//  - sanitize: lowercase, hyphenate non-alnum
//  - simple plural fold (strip trailing 's' when safe)
//  - collapse common synonyms to a single canonical slug to reduce churn
function normalizeSlug(input: string): { slug: string; name: string } {
  const raw = String(input || "").trim().toLowerCase();
  const hyph = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // simple plural fold (stones -> stone) where safe
  const singular = hyph.endsWith("s") && hyph.length > 3 ? hyph.slice(0, -1) : hyph;

  // canonical map (minimal; expand only if truly necessary)
  const map: Record<string, string> = {
    rock: "stone",
    stone: "stone",
    pebble: "stone",
    boulder: "stone",

    branch: "branch",
    stick: "branch",
    twig: "branch",

    torch: "torch",
    lantern: "torch",

    rope: "rope",
    "coil-of-rope": "rope",
    "rope-coil": "rope",
  };

  const canonical = map[singular] || singular;

  // Human name (Title Case, de-hyphen)
  const name = canonical
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return { slug: canonical, name };
}

// Coerce tool args -> EnvDelta[] (relaxed but safe), applying normalization
function coerceDeltas(obj: any): EnvDelta[] | null {
  if (!obj || typeof obj !== "object") return null;
  const arr = Array.isArray(obj.items) ? obj.items : [];
  const out: EnvDelta[] = [];

  for (const d of arr) {
    if (!d || typeof d !== "object") continue;
    const type = d.type === "environment" ? "environment" : null;
    const op = d.op === "add" || d.op === "remove" || d.op === "move" ? d.op : null;
    if (!type || !op) continue;

    if (op === "add") {
      const norm = normalizeSlug(String(d.slug || ""));
      if (!norm.slug) continue;
      const where = d.where === "feature" ? "feature" : "ground";
      const qty = Math.max(1, Math.min(12, Number.isFinite(d.qty) ? Math.floor(d.qty) : 1));
      const tags = Array.isArray(d.tags) ? d.tags.filter((t: any) => typeof t === "string") : undefined;

      out.push({
        type: "environment",
        op: "add",
        slug: norm.slug,
        name: typeof d.name === "string" && d.name.trim() ? d.name.trim() : norm.name,
        where,
        qty,
        tags,
      });
      continue;
    }

    if (op === "remove") {
      const norm = normalizeSlug(String(d.slug || ""));
      if (!norm.slug) continue;
      const where = d.where === "feature" ? "feature" : "ground";
      const qty = Math.max(1, Math.min(12, Number.isFinite(d.qty) ? Math.floor(d.qty) : 1));
      out.push({ type: "environment", op: "remove", slug: norm.slug, where, qty });
      continue;
    }

    if (op === "move") {
      const norm = normalizeSlug(String(d.slug || ""));
      if (!norm.slug) continue;
      const from = d.from === "feature" ? "feature" : "ground";
      const to = d.to === "feature" ? "feature" : "ground";
      const qty = Math.max(1, Math.min(12, Number.isFinite(d.qty) ? Math.floor(d.qty) : 1));
      out.push({ type: "environment", op: "move", slug: norm.slug, from, to, qty });
      continue;
    }
  }

  return out;
}

// ---------------- AI observer core ----------------

export async function proposeEnvDeltas({ narration, sceneTags }: Options): Promise<EnvDelta[]> {
  if (!OPENAI_API_KEY) return fallback();

  const system = clamp(`
You are the Environment Observer for a text-first RPG.

Your scope:
- Read the latest NARRATOR output (any language).
- Propose only small, useful environment changes that the narration clearly supports.

Guidance (generic, not item-specific):
- If narration describes generic, hand-scale, biome-plausible materials on/near the ground
  (common natural debris the player could pick up, throw, block with, tie, light, or otherwise use),
  add a small quantity (1–3) to the environment for this turn, unless the text explicitly states
  none exist or they are unusable.
- Do not invent manufactured gear or rare/valuable objects unless the narration explicitly names them.
- Prefer "ground" for loose items; use "feature" only when narration indicates fixed/mounted (e.g., in sconces).
- Keep quantities small and realistic. Infer from the text (“a few”, numerals, plural forms); default to 1 if unclear.
- Use the simplest lowercase slug from the noun, in English transliteration if needed, and let the game normalize synonyms.
- Use sceneTags only as hints (rails/biome), not as permission to hallucinate.

Return ONLY a function call with environment deltas.
`.trim());

  const user = clamp(`
# NARRATOR OUTPUT
${narration}

# SCENE TAGS
${JSON.stringify(sceneTags, null, 2)}

# TASK
From the narrator output, propose environment deltas that make useful, clearly-described objects available to the player (e.g., items on the ground; mounted torches as features). Keep totals small and realistic. Return ONLY the function call.
`.trim());

  const tools = [
    {
      type: "function",
      function: {
        name: "decide_env_deltas",
        description: "Return environment deltas derived from the narrator output.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["environment"] },
                  op: { type: "string", enum: ["add", "remove", "move"] },
                  slug: { type: "string" },
                  name: { type: "string" },
                  where: { type: "string", enum: ["ground", "feature"] },
                  from: { type: "string", enum: ["ground", "feature"] },
                  to: { type: "string", enum: ["ground", "feature"] },
                  qty: { type: "number" },
                  tags: { type: "array", items: { type: "string" } }
                },
                required: ["type", "op"],
                additionalProperties: true
              }
            }
          },
          required: ["items"],
          additionalProperties: true
        }
      }
    }
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OBSERVER_MODEL,
        temperature: 0.2,
        max_tokens: 180,
        tools,
        tool_choice: { type: "function", function: { name: "decide_env_deltas" } },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const text = await r.text();
    if (!r.ok) return fallback();

    const data = JSON.parse(text);
    const tc = data?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(tc) || tc.length === 0) return fallback();
    if (tc[0]?.function?.name !== "decide_env_deltas") return fallback();

    let args: any = {};
    try { args = JSON.parse(tc[0].function.arguments || "{}"); }
    catch { return fallback(); }

    const deltas = coerceDeltas(args);
    return deltas || fallback();
  } catch {
    return fallback();
  }
}