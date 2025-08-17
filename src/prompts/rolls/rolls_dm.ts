// src/services/rolls_dm.ts

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
  | { kind: "fixed"; ability: string; dcHint?: string; context?: string }
  | { kind: "opposed"; attackerAbility: string; defender: string; context?: string };

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

// ---------- Arbiter Stub ----------
export async function getRollDecision(
  input: ArbiterInput
): Promise<ArbiterDecision> {
  const rules = loadRollRules();

  // In the future: call OpenAI with `rules` + `input.message`
  // For now: always return a placeholder decision.
  return {
    kind: "no-roll",
    reason: "Stub — not yet connected to AI",
  };
}