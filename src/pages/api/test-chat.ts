import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import forestAmbush from "../../prompts/scenarios/forest_ambush";

const PASSCODE = process.env.TEST_CLIENT_PASSCODE || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type Turn = { role: "user" | "assistant"; content: string };

// --- utils ---
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

function buildSystemPrompt(
  scenario: typeof forestAmbush,
  worldDoc: string,
  encounterDoc: string,
  conductorDoc: string
) {
  const world = trimTo(12000, worldDoc);
  const enc = trimTo(8000, encounterDoc);
  const conductor = trimTo(6000, conductorDoc);

  return `
You are the Moonfell encounter engine.

# Encounter Conductor Guide (authoritative)
${conductor || "[No conductor doc loaded]"}

# Scenario (hidden referee brief)
Title: ${scenario.title}
Constraints:
- ${scenario.boundaries.join("\n- ")}
Referee Notes:
${scenario.refereeBrief}

# World Reference (excerpts)
${world || "[No world doc loaded yet]"}

# Encounter Mechanics (excerpts)
${enc || "[No encounter doc loaded yet]"}

# Style & Output
- 6–10 lines per turn, cinematic and concrete; no fourth-wall.
- Always offer 3–5 numbered, straightforward options (attack / defend-brace / move / use tool).
- Leave wild stunts to the player to propose.
- Never show stats, DCs, or dice unless the player types "debug please", in which case append one short [dbg: …] line.
- Stay within scenario boundaries. If the player tries to leave, redirect and explain this is a limited preview.
`.trim();
}

// --- handler ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { passcode, init, message, history = [], scenarioId } = (req.body || {}) as {
    passcode?: string;
    init?: boolean;
    message?: string;
    history?: Turn[];
    scenarioId?: string;
  };

  if (!PASSCODE || !OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server not configured (missing env vars)" });
  }
  if (!passcode || passcode !== PASSCODE) {
    return res.status(401).json({ error: "Invalid passcode" });
  }

  // Load docs
  const worldDoc = safeRead(path.join(process.cwd(), "src", "prompts", "world.md"));
  const encounterDoc = safeRead(path.join(process.cwd(), "src", "prompts", "encounter.md"));
  const conductorDoc = safeRead(path.join(process.cwd(), "src", "prompts", "conductor.md"));

  // Choose scenario (only one for now)
  const scenario = forestAmbush;

  const SYSTEM_PROMPT = buildSystemPrompt(scenario, worldDoc, encounterDoc, conductorDoc);

  // Init: send scenario intro without calling the model
  if (init) {
    return res.status(200).json({
      intro: scenario.introForPlayer,
      scenario: scenario.id,
    });
  }

  const userMessage = (message || "").trim();
  if (!userMessage) return res.status(400).json({ error: "No message provided" });

  const debugMode = userMessage.toLowerCase().includes("debug please");

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
    let reply: string = data?.choices?.[0]?.message?.content?.trim() || "(no reply)";
    if (debugMode) reply += `\n\n[dbg: preview mode; no internal numbers exposed]`;

    return res.status(200).json({ reply, scenario: scenario.id });
  } catch (e: any) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}
