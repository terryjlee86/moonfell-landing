// src/services/rolls_dm.ts
//
// Slim AI-first Rolls DM:
// - Loads rolls_rules.md (all guidance lives there)
// - Sends player message + feeds to the LLM
// - Expects a single JSON decision (no-roll | auto-success | auto-fail | fixed | opposed)
// - Returns the decision (with reason + tags) for the caller to debug/log
//
// Feeds = ground truth; rules.md = the brain.

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

export type ArbiterDecision =
  | { kind: "no-roll"; reason: string; tags?: string[] }
  | { kind: "auto-success"; reason: string; tags?: string[] }
  | { kind: "auto-fail"; reason: string; tags?: string[] }
  | { kind: "fixed"; ability: Ability; dcHint?: DCHint; context?: string; reason: string; tags?: string[] }
  | { kind: "opposed"; attackerAbility: Ability; defender: Defender; context?: string; reason: string; tags?: string[] };

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

// --- relaxed coerceDecision ---
function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.kind !== "string" || typeof obj.reason !== "string") {
    return null;
  }

  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t: any) => typeof t === "string")
    : undefined;

  // Normalise abilities (relax schema)
  const normaliseAbility = (a: any): Ability | undefined => {
    if (!a || typeof a !== "string") return undefined;
    const map: Record<string, Ability> = {
      strength: "STR",
      str: "STR",
      agility: "AGI",
      agi: "AGI",
      endurance: "END",
      end: "END",
      intelligence: "INT",
      int: "INT",
      willpower: "WIL",
      will: "WIL",
      charisma: "CHA",
      cha: "CHA",
    };
    const key = a.toLowerCase();
    return map[key] ?? (["STR","AGI","END","INT","WIL","CHA"].includes(a) ? (a as Ability) : undefined);
  };

  switch (obj.kind) {
    case "no-roll":
    case "auto-success":
    case "auto-fail":
      return { kind: obj.kind, reason: obj.reason, tags };

    case "fixed": {
      const ability = normaliseAbility(obj.ability);
      return {
        kind: "fixed",
        ability: ability ?? "AGI", // safe default
        dcHint: (["easy","standard","hard","heroic"].includes(obj.dcHint) ? obj.dcHint : undefined) as DCHint | undefined,
        context: typeof obj.context === "string" ? obj.context : undefined,
        reason: obj.reason,
        tags,
      };
    }

    case "opposed": {
      const attackerAbility = normaliseAbility(obj.attackerAbility);
      const defender = (["creature","environment","player"].includes(obj.defender) ? obj.defender : "creature") as Defender;
      return {
        kind: "opposed",
        attackerAbility: attackerAbility ?? "AGI",
        defender,
        context: typeof obj.context === "string" ? obj.context : undefined,
        reason: obj.reason,
        tags,
      };
    }

    default:
      return null;
  }
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
You are the Moonfell **Rolls DM**. Your job is to classify the player's action into:
- "no-roll" (pure ambience / no consequence intended)
- "auto-success" (trivial, always succeeds)
- "auto-fail" (physically impossible OR explicitly missing required capability/item/spell)
- "fixed" (test vs environment with a set difficulty; choose ability: STR/AGI/END/INT/WIL/CHA; optional dcHint: easy/standard/hard/heroic)
- "opposed" (contest vs another agent/creature; choose attackerAbility; defender=creature/environment/player)

All reasoning rules and examples are provided below. DO NOT invent inventory; rely on provided tags. Be concise and return JSON only.
`.trim();

  const user = `
# ROLLS RULES (authoritative)
${rules}

# INPUT
${JSON.stringify(payload, null, 2)}

# OUTPUT FORMAT (JSON ONLY)
{
  "kind": "no-roll" | "auto-success" | "auto-fail" | "fixed" | "opposed",
  "reason": "short, plain language why",
  "tags": ["optional","tags","for","debug"],
  "ability": "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA",
  "dcHint": "easy" | "standard" | "hard" | "heroic",
  "context": "optional string",
  "attackerAbility": "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA",
  "defender": "creature" | "environment" | "player"
}

Return ONLY the JSON object, nothing else.
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

    const decision = coerceDecision(parsed);
    return decision ?? fallback("Arbiter fallback (schema mismatch)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}