// src/services/rolls_dm.ts
//
// Slim AI-first Rolls DM:
// - Loads rolls_rules.md (all guidance lives there)
// - Sends player message + feeds to the LLM
// - Expects a single JSON decision (no-roll | auto-success | auto-fail | fixed | opposed)
// - Returns the decision (with reason + tags) for the caller to debug/log
//
// No regex lexicons here. Feeds = ground truth; rules.md = the brain.

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
  sceneTags?: string[];     // from contextFeed()
  inventoryTags?: string[]; // from inventoryFeed().tags
  learnedTags?: string[];   // from learnedFeed().tags
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

// --- normalization helpers (defensive) ---
function asKind(v: any): ArbiterDecision["kind"] | null {
  const s = String(v || "").toLowerCase();
  if (s === "no-roll" || s === "auto-success" || s === "auto-fail" || s === "fixed" || s === "opposed") return s;
  return null;
}
function asAbility(v: any): Ability | undefined {
  const s = String(v || "").toUpperCase();
  return (["STR","AGI","END","INT","WIL","CHA"] as Ability[]).includes(s as Ability) ? (s as Ability) : undefined;
}
function asDCHint(v: any): DCHint | undefined {
  const s = String(v || "").toLowerCase();
  return (["easy","standard","hard","heroic"] as DCHint[]).includes(s as DCHint) ? (s as DCHint) : undefined;
}
function asDefender(v: any): Defender | undefined {
  const s = String(v || "").toLowerCase();
  return (["creature","environment","player"] as Defender[]).includes(s as Defender) ? (s as Defender) : undefined;
}

function coerceDecision(obj: any): ArbiterDecision | null {
  if (!obj || typeof obj !== "object" || typeof obj.reason !== "string") return null;

  const kind = asKind(obj.kind);
  if (!kind) return null;

  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string") : undefined;

  if (kind === "no-roll" || kind === "auto-success" || kind === "auto-fail") {
    return { kind, reason: obj.reason, tags };
  }

  if (kind === "fixed") {
    const ability = asAbility(obj.ability);
    if (!ability) return null;
    const dcHint = asDCHint(obj.dcHint);
    const context = typeof obj.context === "string" ? obj.context : undefined;
    return { kind: "fixed", ability, dcHint, context, reason: obj.reason, tags };
  }

  if (kind === "opposed") {
    const attackerAbility = asAbility(obj.attackerAbility);
    const defender = asDefender(obj.defender);
    if (!attackerAbility || !defender) return null;
    const context = typeof obj.context === "string" ? obj.context : undefined;
    return { kind: "opposed", attackerAbility, defender, context, reason: obj.reason, tags };
  }

  return null;
}

export async function getRollDecision(input: ArbiterInput): Promise<ArbiterDecision> {
  if (!OPENAI_API_KEY) return fallback("Arbiter disabled (no OPENAI_API_KEY)");

  const rules = clamp(loadRollRules(), 14000);

  // Compact feed snapshot (strings only; easy for the model to read)
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

All reasoning rules and examples are provided below in ROLLS RULES. DO NOT invent inventory; rely on provided tags. Be concise and return JSON only.
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
  // if kind="fixed":
  "ability": "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA",
  "dcHint": "easy" | "standard" | "hard" | "heroic",
  "context": "optional string",
  // if kind="opposed":
  "attackerAbility": "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA",
  "defender": "creature" | "environment" | "player",
  "context": "optional string"
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

    // Extract JSON defensively
    const trimmed = (text || "").trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const raw = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return fallback("Arbiter fallback (bad JSON)"); }

    const decision = coerceDecision(parsed);
    return decision ?? fallback("Arbiter fallback (schema mismatch)");
  } catch {
    return fallback("Arbiter fallback (request failed)");
  }
}