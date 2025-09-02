// src/services/narration_observer.ts
//
// AI Observer: reads narrator prose and proposes environment deltas (add/move/remove)
// without hardcoded item lists or English-only heuristics.
// The model infers generic, biome-plausible, hand-scale affordances from narration
// (in any language) and returns deltas we apply to environment state.
//
// Usage:
//   const deltas = await proposeEnvDeltas({ narration, sceneTags });
//   applyDeltas(deltas);
//
// Notes:
// - Language-agnostic: do not assume English; the model infers from text.
// - Do not invent items not described; prefer generic affordances explicitly present.
// - Use sceneTags only as hints (rails/biome/etc.) if provided.
// - Keep outputs small, plausible, and useful this turn.

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

function clamp(text: string, max = 8000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n...[trimmed]..." : text;
}

function fallback(): EnvDelta[] {
  return [];
}

// Coerce tool args -> EnvDelta[] (relaxed but safe)
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
      const slug = String(d.slug || "").trim().toLowerCase().replace(/[^a-z0-9\-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) continue;
      const where = d.where === "feature" ? "feature" : "ground";
      const qty = Math.max(1, Math.min(12, Number.isFinite(d.qty) ? Math.floor(d.qty) : 1));
      const name = typeof d.name === "string" && d.name.trim() ? d.name.trim() : slug;
      const tags = Array.isArray(d.tags) ? d.tags.filter((t: any) => typeof t === "string") : undefined;

      out.push({ type: "environment", op: "add", slug, name, where, qty, tags });
      continue;
    }

    if (op === "remove") {
      const slug = String(d.slug || "").trim().toLowerCase().replace(/[^a-z0-9\-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) continue;
      const where = d.where === "feature" ? "feature" : "ground";
      const qty = Math.max(1, Math.min(12, Number.isFinite(d.qty) ? Math.floor(d.qty) : 1));
      out.push({ type: "environment", op: "remove", slug, where, qty });
      continue;
    }

    if (op === "move") {
      const slug = String(d.slug || "").trim().toLowerCase().replace(/[^a-z0-9\-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) continue;
      const from = d.from === "feature" ? "feature" : "ground";
      const to = d.to === "feature" ? "feature" : "ground";
      const qty = Math.max(1, Math.min(12, Number.isFinite(d.qty) ? Math.floor(d.qty) : 1));
      out.push({ type: "environment", op: "move", slug, from, to, qty });
      continue;
    }
  }

  return out;
}

export async function proposeEnvDeltas({ narration, sceneTags }: Options): Promise<EnvDelta[]> {
  if (!OPENAI_API_KEY) return fallback();

  const system = clamp(`
You are the Environment Observer for a text-first RPG. Your scope is narrow:
- Read the latest NARRATOR output (may be any language).
- Propose only small, useful environment changes that the narration clearly supports (e.g., generic, hand-scale, biome-plausible affordances the player could pick up, throw, block with, light, tie, or otherwise use).
- Do NOT invent specific gear (e.g., firearms) or rare/valuable items unless the narration explicitly says they are present.
- Use sceneTags only as hints (rails/biome/creatures), not as facts to hallucinate new objects.
- Keep quantities small and reasonable. Prefer 1–3 unless the text supports more.
- Prefer "ground" for loose items; use "feature" when mounted/fixed (e.g., torches in sconces).
- This is not narration; you only return structured deltas via the tool function.
`.trim());

  const user = clamp(`
# NARRATOR OUTPUT
${narration}

# SCENE TAGS
${JSON.stringify(sceneTags, null, 2)}

# TASK
From the narrator output, propose environment deltas that make useful, clearly-described objects available to the player (e.g., items on the ground; mounted torches as features). Do not add manufactured gear or biome-implausible objects unless explicitly described. Keep totals small and realistic. Return ONLY the function call.
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