import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

function replyText(value: string): string {
  const normalized = value.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const reply = normalized
    .split(/(?:\s|^)On\s+[^\n]*\s+wrote:\s*/i)[0]
    .split(/\n[-_]{2,}\s*Original Message\s*[-_]{2,}/i)[0]
    .split(/\nFrom:\s*.+\nSent:\s*.+/i)[0]
    .replace(/^\s*>.*$/gm, '');
  return reply.replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

function missingMessageIdColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === 'PGRST204' || error.code === '42703' || /email_message_id/i.test(error.message ?? '')));
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
      for await (const message of client.fetch({ or: [{ seen: false }, { since: new Date(Date.now() - 86400000) }] }, { uid: true, envelope: true, source: true })) {
        const envelope = message.envelope;
        if (!envelope) continue;
        const subject = envelope.subject ?? '';
        const ticketNumber = subject.match(/\b[A-Z]{2,}-\d+\b/i)?.[0];
        const sender = envelope.from?.[0]?.address?.toLowerCase();
        if (!ticketNumber || !sender || !message.source) continue;
        const [{ data: ticket }, { data: profile }] = await Promise.all([
          admin.from('tickets').select('id,requester_id,assigned_to').eq('ticket_number', ticketNumber).maybeSingle(),
          admin.from('profiles').select('id,email,active,role').eq('email', sender).eq('active', true).maybeSingle(),
        ]);
        if (!ticket || !profile || (profile.role !== 'admin' && ticket.requester_id !== profile.id && ticket.assigned_to !== profile.id)) continue;
        const parsed = await simpleParser(message.source);
        const body = replyText(parsed.text ?? '');
        if (!body) { await client.messageFlagsAdd(message.uid, ['\\Seen']); continue; }
        const sourceMessageId = parsed.messageId?.trim().toLowerCase() || `imap:${message.uid}`;
        let { error } = await admin.from('ticket_comments').insert({ ticket_id: ticket.id, author_id: profile.id, body, is_system: false, email_message_id: sourceMessageId });
        let inserted = !error;
        if (missingMessageIdColumn(error)) {
          const { data: duplicate, error: lookupError } = await admin.from('ticket_comments').select('id').eq('ticket_id', ticket.id).eq('author_id', profile.id).eq('body', body).limit(1).maybeSingle();
          if (lookupError) throw lookupError;
          if (!duplicate) {
            const fallback = await admin.from('ticket_comments').insert({ ticket_id: ticket.id, author_id: profile.id, body, is_system: false });
            error = fallback.error;
            inserted = !error;
          } else {
            error = null;
          }
        }
        if (error && error.code !== '23505') throw error;
        await client.messageFlagsAdd(message.uid, ['\\Seen']);
        if (inserted) imported += 1;
      }
    } finally { lock.release(); }
  } catch (error) {
    console.error('Ticket email reply sync failed', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Could not sync ticket replies' });
  } finally { await client.logout().catch((): void => undefined); }
  return res.status(200).json({ imported });
}