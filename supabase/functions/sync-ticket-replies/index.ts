import { createClient } from 'npm:@supabase/supabase-js@2';
import { ImapFlow } from 'npm:imapflow';
import { simpleParser } from 'npm:mailparser';
import { createHash } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Max-Age': '86400',
};

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

function emailCommentId(messageId: string): string {
  const hex = createHash('sha256').update(messageId).digest('hex').slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

async function resolveReplyMailbox(client: ImapFlow): Promise<string> {
  const configured = (Deno.env.get('TICKET_REPLY_IMAP_FOLDER') ?? 'Ticket Replies').trim();
  const expected = configured.toLowerCase();
  const mailboxes = await client.list();
  const match = mailboxes.find((mailbox: any) => mailbox.path.toLowerCase() === expected)
    ?? mailboxes.find((mailbox: any) => mailbox.name.toLowerCase() === expected)
    ?? mailboxes.find((mailbox: any) => mailbox.path.toLowerCase().endsWith(mailbox.delimiter + expected));
  if (!match) throw new Error(`IMAP folder "${configured}" was not found`);
  return match.path;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const imapUser = Deno.env.get('IMAP_USER') ?? Deno.env.get('SMTP_USER');
  const imapPass = Deno.env.get('IMAP_PASS') ?? Deno.env.get('SMTP_PASS');
  const authorization = req.headers.get('authorization');

  const missingConfig = [!supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY', !imapUser && 'IMAP_USER or SMTP_USER', !imapPass && 'IMAP_PASS or SMTP_PASS'].filter(Boolean);
  if (!supabaseUrl || !serviceRoleKey || !imapUser || !imapPass) {
    return new Response(JSON.stringify({ error: 'Reply sync is not configured', missing: missingConfig }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (!authorization) return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { data: operator } = await admin.from('profiles').select('role,active').eq('id', user.id).single();
  if (!operator?.active || operator.role !== 'admin') return new Response(JSON.stringify({ error: 'Administrator access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const smtpHost = Deno.env.get('SMTP_HOST')?.toLowerCase() ?? '';
  const defaultImapHost = smtpHost.includes('secureserver') || smtpHost.includes('godaddy') ? 'imap.secureserver.net' : 'imap.titan.email';
  
  const client = new ImapFlow({
    host: Deno.env.get('IMAP_HOST') ?? defaultImapHost,
    port: Number(Deno.env.get('IMAP_PORT') ?? '993'),
    secure: true,
    auth: { user: imapUser, pass: imapPass },
    connectionTimeout: 8000,
    socketTimeout: 10000,
    logger: false,
  });

  let imported = 0;
  let scanned = 0;
  let replyMailbox = '';
  const skipped = { missingEnvelope: 0, missingMetadata: 0, noTicket: 0, noProfile: 0, notParticipant: 0, emptyBody: 0, duplicate: 0 };
  
  try {
    await client.connect();
    replyMailbox = await resolveReplyMailbox(client);
    const lock = await client.getMailboxLock(replyMailbox);
    try {
      for await (const message of client.fetch({ or: [{ seen: false }, { since: new Date(Date.now() - 86400000) }] }, { uid: true, envelope: true, source: true })) {
        scanned += 1;
        const envelope = message.envelope;
        if (!envelope) { skipped.missingEnvelope += 1; continue; }
        const subject = envelope.subject ?? '';
        const ticketNumber = subject.match(/\b[A-Z]{2,}-\d+\b/i)?.[0];
        const sender = envelope.from?.[0]?.address?.toLowerCase();
        if (!ticketNumber || !sender || !message.source) { skipped.missingMetadata += 1; continue; }
        
        const [{ data: ticket, error: ticketError }, { data: profile, error: profileError }] = await Promise.all([
          admin.from('tickets').select('id,requester_id,assigned_to').ilike('ticket_number', ticketNumber).maybeSingle(),
          admin.from('profiles').select('id,email,active,role').ilike('email', sender).eq('active', true).maybeSingle(),
        ]);
        if (ticketError) throw ticketError; if (profileError) throw profileError;
        if (!ticket) { skipped.noTicket += 1; continue; }
        
        if (profile && profile.role !== 'admin' && ticket.requester_id !== profile.id && ticket.assigned_to !== profile.id) { skipped.notParticipant += 1; continue; }
        const authorId = profile ? profile.id : ticket.requester_id;
        
        const parsed = await simpleParser(message.source);
        const body = replyText(parsed.text ?? '');
        if (!body) { skipped.emptyBody += 1; await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true }); continue; }
        
        const sourceMessageId = parsed.messageId?.trim().toLowerCase() || `imap:${message.uid}`;
        const commentId = emailCommentId(sourceMessageId);
        
        let { error } = await admin.from('ticket_comments').insert({ id: commentId, ticket_id: ticket.id, author_id: authorId, body, is_system: false, email_message_id: sourceMessageId });
        let inserted = !error;
        if (missingMessageIdColumn(error)) {
          const fallback = await admin.from('ticket_comments').insert({ id: commentId, ticket_id: ticket.id, author_id: authorId, body, is_system: false });
          error = fallback.error;
          inserted = !error;
        }
        if (error && error.code !== '23505') throw error;
        if (error?.code === '23505') skipped.duplicate += 1;
        await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        if (inserted) imported += 1;
      }
    } finally { lock.release(); }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isFolderMissing = /IMAP folder .* was not found/i.test(message);
    const diagnostic = {
      command: typeof error?.command === 'string' ? error.command : undefined,
      responseStatus: typeof error?.responseStatus === 'string' ? error.responseStatus : undefined,
      responseText: typeof error?.responseText === 'string' ? error.responseText : undefined,
    };
    console.error('Ticket email reply sync failed', { message, ...diagnostic });
    if (isFolderMissing) {
      return new Response(JSON.stringify({ error: message, hint: 'Create the folder in GoDaddy Webmail and add a filter rule to move ticket replies into it.', diagnostic }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Could not sync ticket replies', detail: message, diagnostic }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } finally { await client.logout().catch((): void => undefined); }
  
  console.info('Ticket reply sync completed', { mailbox: replyMailbox, scanned, imported, skipped });
  return new Response(JSON.stringify({ mailbox: replyMailbox, imported, scanned, skipped }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
