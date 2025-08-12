// src/pages/api/test-chat.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const PASSCODE = process.env.TEST_CLIENT_PASSCODE || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// A tiny system prompt – you can replace/expand with your real “Rules of Moonfell”
const SYSTEM_PROMPT = `
You are the Moonfell encounter engine.
- The game is text-only and asynchronous.
- Player can attempt anything; outcomes must follow the Rules of Moonfell: consistent, responsive, unscripted.
- Always ground results in stats, distance, time, environment, and plausibility.
- Permadeath: if a lethal failure occurs, end that character’s story clearly.
- Be concise but evocative. 6–10 lines max per turn. Offer 2–4 nudges of what might be possible next without forcing choices.
`.trim();

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { passcode, message, history } = req.body as {
      passcode?: string;
      message?: string;
      history?: ChatTurn[];
    };

    if (!PASSCODE) return res.status(500).json({ error: 'Server not configured: TEST_CLIENT_PASSCODE missing' });
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Server not configured: OPENAI_API_KEY missing' });

    if (!passcode || passcode !== PASSCODE) {
      return res.status(401).json({ error: 'Invalid passcode' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'No message provided' });
    }

    const msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(Array.isArray(history) ? history.slice(-8) : []), // keep last few turns
      { role: 'user', content: message.trim() },
    ];

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: msgs,
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: 'OpenAI request failed', detail: text.slice(0, 800) });
    }

    const data = await r.json();
    const reply: string | undefined = data?.choices?.[0]?.message?.content;
    if (!reply) return res.status(500).json({ error: 'No reply from model' });

    res.status(200).json({ reply });
  } catch (e: any) {
    res.status(500).json({ error: 'Unexpected error', detail: String(e) });
  }
}
