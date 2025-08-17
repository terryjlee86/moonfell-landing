// src/services/rolls_dm.ts
//
// Purpose: Ask an LLM ("Rolls DM") to decide if the player's input
// should trigger a roll, and if so what type—using rolls_rules.md as
// the authoritative policy. Returns a small JSON decision for debug.
//
// This does NOT change narration flow; your handler only uses it to
// append a [arb: ...] debug line when the user types "debug please".

import fs from "fs";
import path from "path";

// ---------- Types ----------
export type ArbiterInput = {
  message: string;          // raw player text
  sceneTags?: string[];     // optional scene context
};

export type ArbiterDecision =
  | { kind: "no-roll"; reason: string }
  | { kind: "auto-success"; reason: string }
  | { kind: "auto-fail"; reason: string }
  | { kind: "fixed"; ability: string; dcHint?: string; context?: string; reason?: string }
  | { kind: "opposed"; attackerAbility: string; defender: string; context?: string; reason?: string };

// ---------- Config ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
// You can override model just for the arbiter via OPENAI_ROLLS_MODEL.
// Otherwise it falls back to OPENAI_MODEL or gpt-4o-mini.
const ROLLS_MODEL =
  process.env.OPENAI_ROLLS_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-4o-mini";

// ---------- Load Rules ----------
function loadRollRules(): string {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "src", "prompts", "rolls", "rolls_rules.md"),
      "utf8"
    );
  } catch {
    return "[No rolls_rules.md found]";
  }
}

// ---------- Helpers ----------
function clamp(text: string, max = 8000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n\n...[trimmed]..." : text;
}

function fallback(reason: string): ArbiterDecision {
  return { kind: "no-roll", reason };
}

function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.kind !== "string") return null;

  switch (obj.kind) {
    case "no-roll":
    case "auto-success":
    case "auto-fail":
      if (typeof obj.reason === "string" && obj.reason.length > 0) return obj as ArbiterDecision;
      return null;

    case "fixed":
      if (typeof obj.ability === "string") {
        return {
          kind: "fixed",
          ability: obj.ability,
          dcHint: typeof obj.dcHint === "string" ? obj.dcHint : undefined,
          context: typeof obj.context === "string" ? obj.context : undefined,
          reason: typeof obj.reason === "string" ? obj.reason : undefined,
        };
      }
      return null;

    case "opposed":
      if (typeof obj.attackerAbility === "string" && typeof obj.defender === "string") {
        return {
          kind: "opposed",
          attackerAbility: obj.attackerAbility,
          defender: obj.defender,
          context: typeof obj.context === "string" ? obj.context : undefined,
          reason: typeof obj.reason === "string" ? obj.reason : undefined,
        };
      }
      return null;

    default:
      return null;
  }
}

// ---------- Arbiter (LLM) ----------
export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  const rules = loadRollRules();
  if (!OPENAI_API_KEY) return fallback("Arbiter disabled (no OPENAI_API_KEY)");

  const systemPrompt = `
You are the Rolls DM for a text-first RPG. Your ONLY job:
1) Read the player's latest message.
2) Decide if it requires a dice roll based on the policy below.
3) Return a SINGLE JSON object exactly matching the schema.

Policy (authoritative):
${clamp(rules, 6000)}

Rules of output:
- Output MUST be valid JSON (no extra text).
- Choose exactly one of these kinds:
  "no-roll", "auto-success", "auto-fail", "fixed", "opposed".
- Always include a concise natural-language "reason".
- For "fixed": include "ability" (STR|AGI|END|INT|WIL|CHA), optional "dcHint" ("easy"|"standard"|"hard"|"heroic"), and optional "context".
- For "opposed": include "attackerAbility" (STR|AGI|END|INT|WIL|CHA), "defender" ("creature"|"environment"|"player"), and optional "context".
- Do NOT reveal numbers, DCs, or dice in the reason.
`.trim();

  const userPayload = {
    message: input.message,
    sceneTags: input.sceneTags ?? [],
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ROLLS_MODEL,
        temperature: 0.2,
        max_tokens: 200,
        // Ask for strict JSON; newer models support this.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              "Return only JSON. Schema: ArbiterDecision.\n" +
              JSON.stringify(userPayload),
          },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      return fallback(`Arbiter error (${r.status})`);
    }

    // Expecting a JSON object in choices[0].message.content
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If the model ignored response_format, try to salvage by slicing braces
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(content.slice(start, end + 1));
      }
    }

    const decision = coerceDecision(parsed);
    return decision ?? fallback("Arbiter fallback (unparseable result)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}