// src/services/rolls_dm.ts
//
// Rolls DM: decides if a player's input should trigger a roll,
// returning a structured decision + plain-language reason + optional tags.
// Uses OpenAI function-calling to force structured output.

import fs from "fs";
import path from "path";

export type ArbiterInput = {
  message: string;
  sceneTags?: string[];
};

export type ArbiterDecision =
  | { kind: "no-roll"; reason: string; tags?: string[] }
  | { kind: "auto-success"; reason: string; tags?: string[] }
  | { kind: "auto-fail"; reason: string; tags?: string[] }
  | {
      kind: "fixed";
      ability: string;
      dcHint?: string;
      context?: string;
      reason?: string;
      tags?: string[];
    }
  | {
      kind: "opposed";
      attackerAbility: string;
      defender: string;
      context?: string;
      reason?: string;
      tags?: string[];
    };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

function clamp(text: string, max = 6000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n\n...[trimmed]..." : text;
}

function fallback(reason: string): ArbiterDecision {
  return { kind: "no-roll", reason, tags: ["arbiter-fallback"] };
}

function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.kind !== "string") return null;
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t: any) => typeof t === "string")
    : undefined;

  switch (obj.kind) {
    case "no-roll":
    case "auto-success":
    case "auto-fail": {
      if (typeof obj.reason === "string" && obj.reason.length > 0) {
        return { kind: obj.kind, reason: obj.reason, tags };
      }
      return null;
    }
    case "fixed": {
      if (typeof obj.ability === "string") {
        return {
          kind: "fixed",
          ability: obj.ability,
          dcHint: typeof obj.dcHint === "string" ? obj.dcHint : undefined,
          context: typeof obj.context === "string" ? obj.context : undefined,
          reason: typeof obj.reason === "string" ? obj.reason : undefined,
          tags,
        };
      }
      return null;
    }
    case "opposed": {
      if (typeof obj.attackerAbility === "string" && typeof obj.defender === "string") {
        return {
          kind: "opposed",
          attackerAbility: obj.attackerAbility,
          defender: obj.defender,
          context: typeof obj.context === "string" ? obj.context : undefined,
          reason: typeof obj.reason === "string" ? obj.reason : undefined,
          tags,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  const rules = loadRollRules();
  if (!OPENAI_API_KEY) return fallback("Arbiter disabled (no OPENAI_API_KEY)");

  // Heuristic nudge: if explicit influence verbs appear with a creature reference, prefer opposed CHA vs creature.
  const influenceVerbs =
    "(calm|lull|charm|soothe|distract|frighten|intimidate|persuade|lure|mesmerise|mesmerize|confuse|taunt|mislead)";
  const creatureHints =
    "(creature|goblin|mirefold|beast|guard|lookout|enemy|it|them|him|her)";

  const messageLC = input.message.toLowerCase();
  const hardHint =
    new RegExp(`\\b${influenceVerbs}\\b`).test(messageLC) &&
    new RegExp(`\\b${creatureHints}\\b`).test(messageLC);

  const systemPrompt = `
You are the Rolls DM for a text-first RPG. Your ONLY job:
1) Read the player's latest message.
2) Decide if it requires a dice roll using the policy below.
3) Respond ONLY by calling the provided function with structured arguments.

Policy (authoritative):
${clamp(rules)}

Strict heuristics (use BEFORE fallback-to-ambient):
- If the text includes a verb of influence (e.g., calm, lull, distract, charm, frighten, persuade, lure, mesmerise)
  AND it refers to a creature/NPC (explicitly or by pronoun/description),
  THEN classify as a **Roll Required** (usually kind="opposed", attackerAbility="CHA", defender="creature"),
  tag=["social-influence"].
- Only treat as ambient when NO intent to influence is stated or implied.
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
            kind: {
              type: "string",
              enum: ["no-roll", "auto-success", "auto-fail", "fixed", "opposed"],
              description: "Exactly one decision type.",
            },
            reason: {
              type: "string",
              description: "Short natural-language explanation for the decision.",
            },
            tags: {
              type: "array",
              description:
                "Optional classification tags, e.g. ['ambient-action'] or ['social-influence'].",
              items: { type: "string" },
              nullable: true,
            },
            // fixed-only
            ability: {
              type: "string",
              enum: ["STR", "AGI", "END", "INT", "WIL", "CHA"],
              description: "For kind=fixed: the primary ability used.",
            },
            dcHint: {
              type: "string",
              enum: ["easy", "standard", "hard", "heroic"],
              description: "For kind=fixed: optional difficulty hint.",
              nullable: true,
            },
            context: {
              type: "string",
              description: "Optional short context string.",
              nullable: true,
            },
            // opposed-only
            attackerAbility: {
              type: "string",
              enum: ["STR", "AGI", "END", "INT", "WIL", "CHA"],
              description: "For kind=opposed: the player's primary ability.",
            },
            defender: {
              type: "string",
              enum: ["creature", "environment", "player"],
              description: "For kind=opposed: what opposes the player.",
            },
          },
          required: ["kind", "reason"],
          additionalProperties: false,
        },
      },
    },
  ];

  const userPayload = {
    message: input.message,
    sceneTags: input.sceneTags ?? [],
    // hard nudges to avoid misclassifying intentful influence as ambient
    hardHint,
    guidance:
      "When ambiguous between ambience and influence, prefer 'no-roll' with tags=['ambient-action']. IF influence verb + creature reference, prefer opposed CHA vs creature with tags=['social-influence']."
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 220,
        tools,
        tool_choice: { type: "function", function: { name: "decide_roll" } },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              "Decide roll strictly via the policy. Respond ONLY by calling decide_roll with appropriate fields.\n" +
              JSON.stringify(userPayload),
          },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      return fallback(`Arbiter error (${r.status})`);
    }

    const data = JSON.parse(text);
    const toolCalls = data?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return fallback("Arbiter fallback (no tool call)");
    }

    const first = toolCalls[0];
    if (first?.function?.name !== "decide_roll") {
      return fallback("Arbiter fallback (wrong tool)");
    }

    let args: any = {};
    try {
      args = JSON.parse(first.function.arguments || "{}");
    } catch {
      return fallback("Arbiter fallback (bad tool args)");
    }

    const decision = coerceDecision(args);
    return decision ?? fallback("Arbiter fallback (schema mismatch)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}