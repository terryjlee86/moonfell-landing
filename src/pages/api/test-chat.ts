import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import forestAmbush from "../../prompts/scenarios/forest_ambush";
import { getRollDecision, ArbiterDecision } from "../../services/rolls_dm";

const PASSCODE = process.env.TEST_CLIENT_PASSCODE || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type Turn = { role: "user" | "assistant"; content: string };

// ---------- utils ----------
function safeRead(filePath: string) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function trimTo(maxChars: number, text: string) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n...[trimmed for preview]..."
    : text;
}

// ---------- prompt builder ----------
function buildSystemPrompt(
  scenario: typeof forestAmbush,
  worldDoc: string,
  encounterDoc: string,
  conductorDoc: string,
  systemDoc: string
) {
  const world = trimTo(12000, worldDoc);
  const enc = trimTo(8000, encounterDoc);
  const conductor = trimTo(6000, conductorDoc);
  const system = trimTo(9000, systemDoc);

  return `
You are the Moonfell encounter engine.

# Encounter Conductor Guide (authoritative: narration rules)
${conductor || "[No conductor doc]"}

# System Rules (authoritative: dice & mechanics)
${system || "[No system rules doc]"}

# Scenario (hidden referee brief)
Title: ${scenario.title}
Constraints:
- ${scenario.boundaries.join("\n- ")}
Referee Notes:
${scenario.refereeBrief}

# World Reference (excerpts)
${world || "[No world doc]"}

# Encounter Mechanics (excerpts)
${enc || "[No encounter doc]"}

# Output Contract
- Follow **PLAYER INTERFACE**, **NARRATION ETIQUETTE**, and **START THE SCENE** in the Conductor Guide.
- Always include **3–5 numbered, straightforward options**.
- Apply **System Rules** for initiative/dice; NPCs act proactively when triggers are met.
- No fourth wall. If the user types **"debug please"**, append one short \`[dbg: …]\` line.
- Stay within scenario boundaries; if the player tries to leave, redirect (limited preview).
`.trim();
}

// ---------- handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { passcode, init, message, history = [], scenarioId, debug } = (req.body || {}) as {
    passcode?: string;
    init?: boolean;
    message?: string;
    history?: Turn[];
    scenarioId?: string;
    debug?: boolean; // frontend toggle
  };

  if (!PASSCODE || !OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server not configured (missing env vars)" });
  }
  if (!passcode || passcode !== PASSCODE) {
    return res.status(401).json({ error: "Invalid passcode" });
  }

  // Load prompt docs
  const worldDoc = safeRead(path.join(process.cwd(), "src", "prompts", "world.md"));
  const encounterDoc = safeRead(path.join(process.cwd(), "src", "prompts", "encounter.md"));
  const conductorDoc = safeRead(path.join(process.cwd(), "src", "prompts", "conductor.md"));
  const systemDoc = safeRead(path.join(process.cwd(), "src", "prompts", "system.md"));

  // Choose scenario (extend later if multiple)
  const scenario = forestAmbush;

  const SYSTEM_PROMPT = buildSystemPrompt(
    scenario,
    worldDoc,
    encounterDoc,
    conductorDoc,
    systemDoc
  );

  // Init: send scenario intro without spending tokens
  if (init) {
    return res.status(200).json({
      intro: scenario.introForPlayer,
      scenario: scenario.id,
    });
  }

  const userMessage = (message || "").trim();
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  // Debug is controlled by frontend flag; keep legacy phrase as a fallback
  const debugMode = Boolean(debug) || userMessage.toLowerCase().includes("debug please");

  // Sidecar: call Rolls DM (does NOT affect narration flow)
  let arbiterDecision: ArbiterDecision | null = null;
  try {
    arbiterDecision = await getRollDecision({ message: userMessage });
  } catch {
    arbiterDecision = null;
  }

  const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(Array.isArray(history) ? history.slice(-8) : []),
    { role: "user", content: userMessage },
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: msgs,
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(500).json({ error: "OpenAI request failed", detail: text.slice(0, 800) });
    }

    const data = JSON.parse(text);
    const reply: string = data?.choices?.[0]?.message?.content?.trim() || "(no reply)";

    // Separate debug messages (do NOT modify narrator reply)
    let debugMessages: Array<{ role: "assistant"; content: string }> = [];
    if (debugMode) {
      const preview = userMessage.replace(/\s+/g, " ").slice(0, 140);
      const tagStr = arbiterDecision?.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : "";
      const arb = (() => {
        if (!arbiterDecision) return "unavailable";
        switch (arbiterDecision.kind) {
          case "no-roll":      return `no-roll (${arbiterDecision.reason})${tagStr}`;
          case "auto-success": return `auto-success (${arbiterDecision.reason})${tagStr}`;
          case "auto-fail":    return `auto-fail (${arbiterDecision.reason})${tagStr}`;
          case "fixed":
            return `fixed ability=${arbiterDecision.ability} dcHint=${arbiterDecision.dcHint ?? "?"}${
              arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""
            }${arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""}${tagStr}`;
          case "opposed":
            return `opposed atk=${arbiterDecision.attackerAbility} vs ${arbiterDecision.defender}${
              arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""
            }${arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""}${tagStr}`;
          default:             return "unknown";
        }
      })();

      debugMessages = [
        { role: "assistant", content: `[arb: input="${preview}" | ${arb}]` },
        { role: "assistant", content: `[dbg: preview mode; internal rolls hidden]` },
      ];
    }

    // Return narrator reply + separate debug messages for the UI to render before it
    return res.status(200).json({ reply, scenario: scenario.id, debugMessages });
  } catch (e: any) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}