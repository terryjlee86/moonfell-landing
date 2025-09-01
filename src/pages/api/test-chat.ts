// src/pages/api/test-chat.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import forestAmbush from "../../prompts/scenarios/forest_ambush";
import { getRollDecision, ArbiterDecision } from "../../services/rolls_dm";

// NEW: bring in the feeds (safe, compact serializers)
import { characterFeed } from "../../feeds/character_feed";
import { inventoryFeed } from "../../feeds/inventory_feed";
import { contextFeed } from "../../feeds/context_feed";
import { learnedFeed } from "../../feeds/learned_feed";

// NEW: delta applier
import { applyDeltas, type Delta } from "../../services/delta_applier";

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
    debug?: boolean; // <-- front-end checkbox toggles this
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

  // ---------- Gather feeds (compact, prompt-safe) ----------
  // These feeds DO NOT affect narration; they only help the Rolls DM decide feasibility.
  let arbiterDecision: ArbiterDecision | null = null;

  const char = characterFeed();    // { name, stance, stats, activeConditions }
  const inv  = inventoryFeed();    // { tags: string[], list: {...} }
  const ctx  = contextFeed();      // { tags: string[] }
  const lrn  = learnedFeed();      // { tags: string[], list: {...} }

  // Ask the Rolls DM with feeds
  try {
    arbiterDecision = await getRollDecision({
      message: userMessage,
      sceneTags: ctx.tags,            // rails + creatures
      inventoryTags: inv.tags,        // shield/ranged/light/rope/healing/throwable:X
      learnedTags: lrn.tags,          // pc:skill:*, pc:spell:*
      character: {
        name: char.name,
        stance: char.stance,
        stats: char.stats,
        activeConditions: char.activeConditions,
      },
    });

    // NEW: apply any immediate deltas from the arbiter
    if (arbiterDecision && (arbiterDecision as any).apply_now) {
      applyDeltas(((arbiterDecision as any).apply_now as Delta[]) || []);
    }
  } catch {
    arbiterDecision = null; // never block the player flow if arbiter fails
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
    let reply: string = data?.choices?.[0]?.message?.content?.trim() || "(no reply)";

    // ---------- Debug output (optional; does not change the narrator’s prose) ----------
    if (debug === true) {
      const preview = userMessage.replace(/\s+/g, " ").slice(0, 140);

      const decisionStr = (() => {
        if (!arbiterDecision) return "unavailable";
        switch (arbiterDecision.kind) {
          case "no-roll":
          case "auto-success":
          case "auto-fail":
            return `${arbiterDecision.kind} (${arbiterDecision.reason})${
              arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""
            }`;
          case "fixed":
            return `fixed ability=${arbiterDecision.ability}${
              arbiterDecision.dcHint ? ` dcHint=${arbiterDecision.dcHint}` : ""
            }${
              arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""
            }${
              arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""
            }${
              arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""
            }`;
          case "opposed":
            return `opposed atk=${arbiterDecision.attackerAbility} vs ${
              arbiterDecision.defender
            }${
              arbiterDecision.context ? ` ctx="${arbiterDecision.context}"` : ""
            }${
              arbiterDecision.reason ? ` reason="${arbiterDecision.reason}"` : ""
            }${
              arbiterDecision.tags?.length ? ` tags=${JSON.stringify(arbiterDecision.tags)}` : ""
            }`;
          default:
            return "unknown";
        }
      })();

      // compact snapshot of feeds that informed the decision
      const feedTags = [
        ...ctx.tags,
        ...inv.tags,
        ...lrn.tags,
      ]
        .slice(0, 24) // prevent huge lines
        .join(", ");

      const cond = (char.activeConditions?.length ? char.activeConditions.join(",") : "none");

      const dbgBlock =
        `[arb: input="${preview}" | ${decisionStr}]\n` +
        `[feeds: ${feedTags} | stance=${char.stance} cond=${cond}]`;

      // prepend debug to the narrator reply so it shows *just before* prose
      reply = `${dbgBlock}\n\n${reply}`;
    }

    return res.status(200).json({ reply, scenario: scenario.id });
  } catch (e: any) {
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}