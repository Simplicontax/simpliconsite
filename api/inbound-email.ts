import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import process from 'node:process';

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

function missingMessageIdColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === 'PGRST204' || error.code === '42703' || /email_message_id/i.test(error.message ?? '')));
}

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Validate shared secret so only Cloudmailin can call this endpoint
  const token = req.query['token'] as string | undefined;
  if (!token || token !== process.env.CLOUDMAILIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Supabase not configured' });

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Cloudmailin normalized / original format support
    const headers = payload.headers ?? {};
    const subject: string = headers.subject ?? headers.Subject ?? '';
    const fromRaw: string = payload.envelope?.from ?? headers.from ?? headers.From ?? '';
    const senderEmail = extractEmail(fromRaw);
    const plainText: string = payload.reply_plain ?? payload.plain ?? '';
    const rawMessageId: string = headers['message-id'] ?? headers['Message-ID'] ?? headers['message_id'] ?? '';

    if (!subject || !senderEmail) {
      return res.status(200).json({ message: 'Missing subject or sender, ignored' });
    }

    // Extract ticket number from subject (e.g. ST-002000)
    const ticketNumber = subject.match(/\b[A-Z]{2,}-\d+\b/i)?.[0];
    if (!ticketNumber) {
      return res.status(200).json({ message: 'No ticket number in subject, ignored' });
    }

    const body = replyText(plainText);
    if (!body) return res.status(200).json({ message: 'Empty reply body, ignored' });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const [{ data: ticket, error: ticketError }, { data: profile }] = await Promise.all([
      admin.from('tickets').select('id,requester_id,assigned_to').ilike('ticket_number', ticketNumber).maybeSingle(),
      admin.from('profiles').select('id,email,active,role').ilike('email', senderEmail).eq('active', true).maybeSingle(),
    ]);
    if (ticketError) throw ticketError;
    if (!ticket) return res.status(200).json({ message: `Ticket ${ticketNumber} not found, ignored` });

    // If sender has a profile, verify they're a participant
    if (profile && profile.role !== 'admin' && ticket.requester_id !== profile.id && ticket.assigned_to !== profile.id) {
      return res.status(200).json({ message: 'Sender not a ticket participant, ignored' });
    }

    // Attribute to profile if known, otherwise to the ticket requester
    const authorId = profile ? profile.id : ticket.requester_id;

    const sourceMessageId = rawMessageId.trim().toLowerCase() || `cloudmailin:${senderEmail}:${Date.now()}`;
    const commentId = emailCommentId(sourceMessageId);

    let { error } = await admin.from('ticket_comments').insert({ id: commentId, ticket_id: ticket.id, author_id: authorId, body, is_system: false, email_message_id: sourceMessageId });
    if (missingMessageIdColumn(error)) {
      const fallback = await admin.from('ticket_comments').insert({ id: commentId, ticket_id: ticket.id, author_id: authorId, body, is_system: false });
      error = fallback.error;
    }
    if (error && error.code !== '23505') throw error;

    const result = error?.code === '23505' ? 'duplicate' : 'imported';
    console.info('Inbound email webhook:', { ticketNumber, senderEmail, result });
    return res.status(200).json({ message: result, ticketNumber, author: authorId });
  } catch (error) {
    console.error('Inbound email webhook failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
