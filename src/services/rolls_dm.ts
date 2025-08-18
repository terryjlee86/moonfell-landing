// src/services/rolls_dm.ts
//
// Slim AI-first Rolls DM:
// - Loads rolls_rules.md (all guidance lives there)
// - Sends player message + feeds to the LLM
// - Expects a JSON decision (no-roll | auto-success | auto-fail | fixed | opposed)
// - Returns the decision (with reason + tags) for the caller to debug/log
//
// Schema is relaxed to avoid constant fallback. Always returns something.

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
  // optional depending on kind:
  ability?: Ability;
  dcHint?: DCHint;
  context?: string;
  attackerAbility?: Ability;
  defender?: Defender;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function clamp(text: string, max = 9000) {
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

// --- RELAXED COERCION ---
function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.kind !== "string" || typeof obj.reason !== "string") {
    return { kind: "no-roll", reason: "Malformed response", tags: ["arbiter-fallback"] };
  }

  // Normalise tags
  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string") : undefined;

  const decision: ArbiterDecision = {
    kind: obj.kind,
    reason: obj.reason,
    tags,
  };

  if (obj.ability) decision.ability = obj.ability;
  if (obj.dcHint) decision.dcHint = obj.dcHint;
  if (obj.context) decision.context = obj.context;
  if (obj.attackerAbility) decision.attackerAbility = obj.attackerAbility;
  if (obj.defender) decision.defender = obj.defender;

  return decision;
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
You are the Moonfell **Rolls DM**.
Your job is to classify the player's action into:
- "no-roll" (pure ambience / no consequence intended)
- "auto-success" (trivial, always succeeds)
- "auto-fail" (physically impossible OR explicitly missing required item/spell)
- "fixed" (test vs environment; ability: STR/AGI/END/INT/WIL/CHA; optional dcHint: easy/standard/hard/heroic)
- "opposed" (contest vs another agent; attackerAbility; defender=creature/environment/player)

All reasoning rules and examples are below. DO NOT invent inventory; rely on provided tags. 
Return JSON only.
`.trim();

  const user = `
# ROLLS RULES
${rules}

# INPUT
${JSON.stringify(payload, null, 2)}

# OUTPUT FORMAT (JSON ONLY)
{ "kind": "...", "reason": "...", "tags": ["..."], ... }
`.trim();

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 250,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) return fallback(`Arbiter error (${r.status})`);

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const raw = jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text;

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return fallback("Arbiter fallback (bad JSON)"); }

    return coerceDecision(parsed) ?? fallback("Arbiter fallback (schema mismatch)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}