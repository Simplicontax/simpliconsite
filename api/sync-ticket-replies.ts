import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export const config = { maxDuration: 60 };

function replyText(value: string): string {
  const normalized = value.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const reply = normalized
    .split(/(?:\s|^)On\s+[^\n]*\s+wrote:\s*/i)[0]
    .split(/\n[-_]{2,}\s*Original Message\s*[-_]{2,}/i)[0]
    .split(/\nFrom:\s*.+\nSent:\s*.+/i)[0]
    .replace(/^\s*>.*$/gm, '');
  return reply.replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

function emailCommentId(messageId: string): string {
  const hex = createHash('sha256').update(messageId).digest('hex').slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

async function resolveReplyMailbox(client: ImapFlow): Promise<string> {
  const configured = (process.env.TICKET_REPLY_IMAP_FOLDER ?? 'Ticket Replies').trim();
  const expected = configured.toLowerCase();
  const mailboxes = await client.list();
  const match = mailboxes.find((mailbox) => mailbox.path.toLowerCase() === expected)
    ?? mailboxes.find((mailbox) => mailbox.name.toLowerCase() === expected)
    ?? mailboxes.find((mailbox) => mailbox.path.toLowerCase().endsWith(mailbox.delimiter + expected));
  if (!match) throw new Error(`IMAP folder "${configured}" was not found`);
  return match.path;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const imapUser = process.env.IMAP_USER ?? process.env.SMTP_USER;
  const imapPass = process.env.IMAP_PASS ?? process.env.SMTP_PASS;
  const authorization = req.headers.authorization;
  const missing = [!supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY', !imapUser && 'IMAP_USER or SMTP_USER', !imapPass && 'IMAP_PASS or SMTP_PASS'].filter(Boolean);

  if (!supabaseUrl || !serviceRoleKey || !imapUser || !imapPass) return res.status(503).json({ error: 'Reply sync is not configured', missing });
  if (!authorization) return res.status(401).json({ error: 'Missing authorization' });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (userError || !user) return res.status(401).json({ error: 'Invalid session' });
  const { data: operator, error: operatorError } = await admin.from('profiles').select('role,active').eq('id', user.id).single();
  if (operatorError) return res.status(500).json({ error: 'Could not verify administrator access', detail: operatorError.message });
  if (!operator?.active || operator.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });

  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? 'imap.secureserver.net',
    port: Number(process.env.IMAP_PORT ?? '993'),
    secure: true,
    auth: { user: imapUser, pass: imapPass },
    connectionTimeout: 15000,
    socketTimeout: 30000,
    logger: false,
  });
  let imported = 0;
  let scanned = 0;
  let replyMailbox = '';
  let remaining = 0;
  const skipped = { missingEnvelope: 0, missingMetadata: 0, noTicket: 0, notParticipant: 0, emptyBody: 0, duplicate: 0 };

  try {
    await client.connect();
    replyMailbox = await resolveReplyMailbox(client);
    const lock = await client.getMailboxLock(replyMailbox);
    try {
      const unreadResult = await client.search({ seen: false }, { uid: true });
      const unreadUids = unreadResult || [];
      const candidateUids = unreadUids.slice(0, 1);
      remaining = Math.max(0, unreadUids.length - candidateUids.length);
      if (candidateUids.length) {
        for await (const message of client.fetch(candidateUids, { uid: true, envelope: true, source: true }, { uid: true })) {
          scanned += 1;
          const envelope = message.envelope;
          if (!envelope) {
            skipped.missingEnvelope += 1;
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }
          const ticketNumber = (envelope.subject ?? '').match(/\b[A-Z]{2,}-\d+\b/i)?.[0];
          const sender = envelope.from?.[0]?.address?.toLowerCase();
          if (!ticketNumber || !sender || !message.source) {
            skipped.missingMetadata += 1;
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }

          const [{ data: ticket, error: ticketError }, { data: profile, error: profileError }] = await Promise.all([
            admin.from('tickets').select('id,requester_id,assigned_to').ilike('ticket_number', ticketNumber).maybeSingle(),
            admin.from('profiles').select('id,email,active,role').ilike('email', sender).eq('active', true).maybeSingle(),
          ]);
          if (ticketError) throw ticketError;
          if (profileError) throw profileError;
          if (!ticket) {
            skipped.noTicket += 1;
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }
          if (profile && profile.role !== 'admin' && ticket.requester_id !== profile.id && ticket.assigned_to !== profile.id) {
            skipped.notParticipant += 1;
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }

          const parsed = await simpleParser(message.source);
          const body = replyText(parsed.text ?? '');
          if (!body) {
            skipped.emptyBody += 1;
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }
          const sourceMessageId = parsed.messageId?.trim().toLowerCase() || `imap:${message.uid}`;
          const commentId = emailCommentId(sourceMessageId);
          const { error: insertError } = await admin.from('ticket_comments').insert({
            id: commentId,
            ticket_id: ticket.id,
            author_id: profile?.id ?? ticket.requester_id,
            body,
            is_system: false,
            email_message_id: sourceMessageId,
          });
          if (insertError && insertError.code !== '23505') throw insertError;
          if (insertError?.code === '23505') skipped.duplicate += 1;
          else imported += 1;
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } catch (error: unknown) {
    const failure = error as { message?: string; command?: string; responseStatus?: string; responseText?: string; code?: string };
    const detail = failure.message ?? String(error);
    console.error('Ticket email reply sync failed', { detail, command: failure.command, responseStatus: failure.responseStatus, responseText: failure.responseText, code: failure.code });
    return res.status(500).json({ error: 'Could not sync ticket replies', detail, diagnostic: { command: failure.command, responseStatus: failure.responseStatus, responseText: failure.responseText, code: failure.code } });
  } finally {
    await client.logout().catch((): void => undefined);
  }

  console.info('Ticket reply sync completed', { mailbox: replyMailbox, scanned, imported, remaining, skipped });
  return res.status(200).json({ mailbox: replyMailbox, imported, scanned, remaining, skipped });
}
