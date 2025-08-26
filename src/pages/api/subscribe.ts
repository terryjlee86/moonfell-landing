// src/pages/api/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, name, consent, utm } = (req.body || {}) as {
    email?: string;
    name?: string;
    consent?: boolean;
    utm?: Record<string, string>;
  };

  if (!email || !consent) {
    return res.status(400).json({ error: "Email and consent are required" });
  }

  try {
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
    const apiKey = process.env.BEEHIIV_API_KEY;

    if (!publicationId || !apiKey) {
      return res.status(500).json({ error: "Beehiiv env vars not configured" });
    }

    // Basic audit trail fields
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";
    const ts = new Date().toISOString();

    const url = `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`;

    const payload: Record<string, any> = {
      email,
      utm_source: utm?.utm_source || "moonfell_live",
      utm_medium: utm?.utm_medium,
      utm_campaign: utm?.utm_campaign,
      utm_content: utm?.utm_content,
      send_welcome_email: false,
      reactivate_existing: true,
      double_opt_in: true,
      // Store basic context in custom_fields if you later map them in Beehiiv
      custom_fields: {
        name: name || "",
        consent: String(!!consent),
        ip,
        ts,
      },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();

    if (!r.ok) {
      console.error("Beehiiv error", r.status, text);
      return res.status(400).json({
        error: "Subscription failed",
        status: r.status,
        detail: text.slice(0, 1000),
      });
    }

    return res.status(200).json({ ok: true, detail: text.slice(0, 400) });
  } catch (e: any) {
    console.error("Subscribe handler exception", e);
    return res.status(500).json({ error: "Unexpected error", detail: String(e) });
  }
}
