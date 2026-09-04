import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!authorization) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  if (!supabaseUrl || !publishableKey) {
    return res.status(503).json({ error: 'Reply sync proxy is not configured' });
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/sync-ticket-replies`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        apikey: publishableKey,
      },
    });
    const payload = await upstream.text();

    res.setHeader('Cache-Control', 'no-store');
    if (!payload.trim()) {
      console.error('Ticket reply sync function returned an empty response', { status: upstream.status });
      return res.status(502).json({ error: 'The mailbox sync service returned no diagnostic response', upstreamStatus: upstream.status });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    return res.status(upstream.status).send(payload);
  } catch (error) {
    console.error('Ticket reply sync proxy failed', error);
    return res.status(502).json({ error: 'Reply sync service is temporarily unavailable' });
  }
}