// src/services/rolls_dm.ts
//
// AI-first Rolls DM (tool-call enforced):
// - Loads rolls_rules.md (all guidance lives there)
// - Sends player message + feeds to the LLM
// - Expects a function call `decide_roll` with structured args
// - Relaxes missing fields (adds tag "arbiter-relaxed") instead of hard failing
// - No regex lexicons; feeds are the ground truth.

import fs from "fs";
import path from "path";

export type ArbiterInputCharacter = {
  name?: string;
  stance?: "neutral" | "braced" | "sprinting" | string;
  stats?: { STR?: number; AGI?: number; END?: number; INT?: number; WIL?: number; CHA?: number };
  activeConditions?: string[];
};

export type ArbiterInput = {
  message: string;
  sceneTags?: string[];
  inventoryTags?: string[];
  learnedTags?: string[];
  character?: ArbiterInputCharacter;
};

export type Ability = "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA";
export type DCHint = "easy" | "standard" | "hard" | "heroic";
export type Defender = "creature" | "environment" | "player";

export type ArbiterDecision = {
  kind: "no-roll" | "auto-success" | "auto-fail" | "fixed" | "opposed";
  reason: string;
  tags?: string[];
  ability?: Ability;
  dcHint?: DCHint;
  context?: string;
  attackerAbility?: Ability;
  defender?: Defender;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function clamp(text: string, max = 14000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n\n...[trimmed]..." : text;
}
function loadRollRules(): string {
  try {
    const p = path.join(process.cwd(), "src", "prompts", "rolls", "rolls_rules.md");
    return fs.readFileSync(p, "utf8");
  } catch {
    return "[No rolls_rules.md found]";
  }
}
function fallback(reason: string): ArbiterDecision {
  return { kind: "no-roll", reason, tags: ["arbiter-fallback"] };
}

// relaxed coercion from tool args
function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object") return null;

  const kind = typeof obj.kind === "string" ? obj.kind : "no-roll";
  const reason =
    typeof obj.reason === "string" && obj.reason.trim()
      ? obj.reason
      : "Unspecified reason";

  let relaxed = false;

  const out: ArbiterDecision = { kind, reason };

  if (Array.isArray(obj.tags)) out.tags = obj.tags.filter((t: any) => typeof t === "string");

  // optional fields
  if (typeof obj.ability === "string") out.ability = obj.ability;
  else if (kind === "fixed") relaxed = true;

  if (typeof obj.dcHint === "string") out.dcHint = obj.dcHint;
  if (typeof obj.context === "string") out.context = obj.context;

  if (typeof obj.attackerAbility === "string") out.attackerAbility = obj.attackerAbility;
  else if (kind === "opposed") relaxed = true;

  if (typeof obj.defender === "string") out.defender = obj.defender;
  else if (kind === "opposed") relaxed = true;

  if (relaxed) {
    out.tags = [...(out.tags ?? []), "arbiter-relaxed"];
  }
  return out;
}

export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  if (!OPENAI_API_KEY) return fallback("Arbiter disabled (no OPENAI_API_KEY)");

  const rules = clamp(loadRollRules(), 14000);

  const payload = {
    message: input.message.trim(),
    tags: {
      scene: (input.sceneTags ?? []).slice(0, 200),
      inventory: (input.inventoryTags ?? []).slice(0, 200),
      learned: (input.learnedTags ?? []).slice(0, 200),
    },
    character: input.character ?? {},
  };

  const system = `
You are the Moonfell **Rolls DM**. Classify the player's action into exactly one:
- "no-roll" (pure ambience / no consequence intended)
- "auto-success" (trivial, always succeeds)
- "auto-fail" (physically impossible OR explicitly missing required item/spell)
- "fixed" (test vs environment; ability: STR/AGI/END/INT/WIL/CHA; optional dcHint: easy/standard/hard/heroic)
- "opposed" (contest vs another agent; attackerAbility; defender=creature/environment/player)

Use ONLY the provided feeds/tags for what exists. Do not invent inventory. Be concise.
All reasoning policy/rules are provided by the ROLLS RULES content. Return your answer by calling the tool function.
`.trim();

  const user = `
# ROLLS RULES (authoritative)
${rules}

# INPUT
${JSON.stringify(payload, null, 2)}
`.trim();

  const tools = [
    {
      type: "function",
      function: {
        name: "decide_roll",
        description: "Return the roll decision for the player's input.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string" },
            reason: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            ability: { type: "string" },
            dcHint: { type: "string" },
            context: { type: "string" },
            attackerAbility: { type: "string" },
            defender: { type: "string" },
          },
          required: ["kind", "reason"],
          additionalProperties: true, // relaxed: allow wiggle room
        },
      },
    },
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "decide_roll" } },
      }),
    });

    const text = await r.text();
    if (!r.ok) return fallback(`Arbiter error (${r.status})`);

    const data = JSON.parse(text);
    const toolCalls = data?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return fallback("Arbiter fallback (no tool call)");
    }

    const call = toolCalls[0];
    if (call?.function?.name !== "decide_roll") {
      return fallback("Arbiter fallback (wrong tool)");
    }

    let args: any = {};
    try { args = JSON.parse(call.function.arguments || "{}"); }
    catch { return fallback("Arbiter fallback (bad tool args)"); }

    return coerceDecision(args) ?? fallback("Arbiter fallback (schema mismatch)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}