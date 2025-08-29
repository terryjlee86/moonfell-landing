// src/pages/api/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";

type UTM = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

type Body = {
  email?: string;
  name?: string;
  consent?: boolean;
  utm?: UTM;
  hp?: string; // honeypot
};

const BEEHIIV_BASE = "https://api.beehiiv.com/v2/publications";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, name, consent, utm, hp } = (req.body || {}) as Body;

    // Honeypot: if present, silently OK (bots)
    if (hp) return res.status(200).json({ ok: true });

    if (!email || !consent) {
      return res.status(400).json({ error: "Email and consent are required." });
    }

    const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
    const apiKey = process.env.BEEHIIV_API_KEY;

    if (!publicationId || !apiKey) {
      return res.status(500).json({ error: "Beehiiv env vars not configured." });
    }

    // Basic context (do NOT rely on these being custom_fields yet)
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";
    const ts = new Date().toISOString();

    // -------- Minimal, known-good payload (no custom_fields) --------
    // Only send fields Beehiiv expects without additional configuration.
    const payload: Record<string, any> = {
      email: String(email).trim(),
      referring_site: "moonfell.live",
      send_welcome_email: true,     // or false, if you prefer your own welcome email
      reactivate_existing: true,    // revive past unsubscribes if allowed
      double_opt_in: true,          // require confirmation
      utm_source: utm?.utm_source ?? "moonfell_live",
      utm_medium: utm?.utm_medium ?? undefined,
      utm_campaign: utm?.utm_campaign ?? undefined,
      utm_content: utm?.utm_content ?? undefined,
      // NOTE: If you want to store name, consent, ip, ts in Beehiiv,
      // create matching custom fields in Beehiiv first, then uncomment below.
      /*
      custom_fields: [
        ...(name ? [{ name: "name", value: name }] : []),
        { name: "consent", value: String(!!consent) },
        { name: "ip", value: ip },
        { name: "ts", value: ts },
      ],
      */
    };

    const url = `${BEEHIIV_BASE}/${publicationId}/subscriptions`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    // Try to parse JSON; if not JSON, keep text for debugging
    let body: any = null;
    let raw = "";
    try {
      body = await r.json();
    } catch {
      try {
        raw = await r.text();
      } catch {}
    }

    // Treat 200/201 OK and 409 "already subscribed" as success
    if (r.ok || r.status === 409) {
      return res.status(200).json({
        ok: true,
        status: r.status,
        note: r.status === 409 ? "Already subscribed" : undefined,
        beehiiv: body ?? raw,
      });
    }

    // Surface Beehiiv message for faster debugging
    const msg =
      body?.message ||
      body?.error ||
      (Array.isArray(body?.errors) ? body.errors.map((e: any) => e?.message).join(" | ") : "") ||
      `Beehiiv error ${r.status}`;

    console.error("Beehiiv subscribe failed:", r.status, msg, body ?? raw);
    return res.status(400).json({ error: msg, status: r.status });
  } catch (err: any) {
    console.error("Subscribe route error:", err);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
}