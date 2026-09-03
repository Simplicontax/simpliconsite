import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

function replyText(value: string): string {
  return value.replace(/\r/g, '').split(/\nOn .+wrote:\n/i)[0].split(/\nFrom:.+\nSent:.+\n/i)[0].trim().slice(0, 5000);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const imapUser = process.env.IMAP_USER;
  const imapPass = process.env.IMAP_PASS;
  const authorization = req.headers.authorization;
  if (!supabaseUrl || !serviceRoleKey || !imapUser || !imapPass || !authorization) return res.status(503).json({ error: 'Reply sync is not configured' });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (!user) return res.status(401).json({ error: 'Invalid session' });
  const { data: operator } = await admin.from('profiles').select('role,active').eq('id', user.id).single();
  if (!operator?.active || operator.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });

  const client = new ImapFlow({ host: process.env.IMAP_HOST ?? 'imap.secureserver.net', port: Number(process.env.IMAP_PORT ?? '993'), secure: true, auth: { user: imapUser, pass: imapPass } });
  let imported = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(process.env.TICKET_REPLY_IMAP_FOLDER ?? 'Ticket Replies');
    try {
      for await (const message of client.fetch({ seen: false }, { uid: true, envelope: true, source: true })) {
        const subject = message.envelope.subject ?? '';
        const ticketNumber = subject.match(/\b[A-Z]{2,}-\d+\b/i)?.[0];
        const sender = message.envelope.from?.[0]?.address?.toLowerCase();
        if (!ticketNumber || !sender || !message.source) continue;
        const [{ data: ticket }, { data: profile }] = await Promise.all([
          admin.from('tickets').select('id,requester_id,assigned_to').eq('ticket_number', ticketNumber).maybeSingle(),
          admin.from('profiles').select('id,email,active,role').eq('email', sender).eq('active', true).maybeSingle(),
        ]);
        if (!ticket || !profile || (profile.role !== 'admin' && ticket.requester_id !== profile.id && ticket.assigned_to !== profile.id)) continue;
        const parsed = await simpleParser(message.source);
        const body = replyText(parsed.text ?? '');
        if (!body) { await client.messageFlagsAdd(message.uid, ['\\Seen']); continue; }
        const { error } = await admin.from('ticket_comments').insert({ ticket_id: ticket.id, author_id: profile.id, body, is_system: false });
        if (error) throw error;
        await client.messageFlagsAdd(message.uid, ['\\Seen']);
        imported += 1;
      }
    } finally { lock.release(); }
  } catch (error) {
    console.error('Ticket email reply sync failed', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Could not sync ticket replies' });
  } finally { await client.logout().catch((): void => undefined); }
  return res.status(200).json({ imported });
}