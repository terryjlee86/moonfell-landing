import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, consent, utm } = req.body as {
    email?: string;
    name?: string;
    consent?: boolean;
    utm?: Record<string, string>;
  };

  if (!email || !consent) {
    return res.status(400).json({ error: 'Email and consent are required' });
  }

  try {
    const url = `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUBLICATION_ID}/subscriptions`;

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BEEHIIV_API_KEY || ''}`,
      },
      body: JSON.stringify({
        email,
        utm_source: utm?.utm_source || 'moonfell_live',
        utm_medium: utm?.utm_medium,
        utm_campaign: utm?.utm_campaign,
        send_welcome_email: false,
        reactivate_existing: true,
        double_opt_in: true,
        // We can add custom fields or tags later once base call works
      }),
    });

    const text = await r.text(); // get response body

    if (!r.ok) {
      console.error('Beehiiv error', r.status, text);
      return res.status(400).json({
        error: 'Subscription failed',
        status: r.status,
        detail: text.slice(0, 1000), // send first part of Beehiiv’s response for debugging
      });
    }

    return res
      .status(200)
      .json({ ok: true, detail: text.slice(0, 400) }); // success
  } catch (e: any) {
    console.error('Subscribe handler exception', e);
    return res
      .status(500)
      .json({ error: 'Unexpected error', detail: String(e) });
  }
}
