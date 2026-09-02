import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import process from 'node:process';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Role = 'admin' | 'team' | 'client';
type Profile = { id: string; email: string; full_name: string; role: Role; active: boolean };
type Ticket = { id: string; ticket_number: string; subject: string; country: string; tax_year: number; status: string; priority: string; requester_id: string; assigned_to: string | null };
type EmailEvent = { id: string; ticket_id: string; actor_id: string; event_type: string; detail: string; created_at: string; attempts: number };
type TicketActivity = { id: string; ticket_id: string; author_id: string; body: string; is_system: boolean; created_at: string };

const eventLabels: Record<string, string> = {
  ticket_created: 'New client request',
  comment_added: 'New message',
  document_uploaded: 'Document uploaded',
  assignment_changed: 'Assignment updated',
  workflow_changed: 'Workflow status updated',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityEventType(activity: TicketActivity): string {
  if (activity.is_system && /^Request routed to /i.test(activity.body)) return 'ticket_created';
  if (activity.is_system && / uploaded /i.test(activity.body)) return 'document_uploaded';
  if (activity.is_system && /^Ticket .* has been assigned to /i.test(activity.body)) return 'assignment_changed';
  if (activity.is_system && / changed status from /i.test(activity.body)) return 'workflow_changed';
  return 'comment_added';
}

function notificationQueueIsUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /ticket_email_(events|deliveries)/i.test(error.message ?? '');
}
function smtpFailureDetail(error: unknown): string {
  const smtpError = error as { code?: string; responseCode?: number } | null;
  if (smtpError?.code === 'EAUTH' || smtpError?.responseCode === 535) return 'SMTP login was rejected. Verify SMTP_USER and SMTP_PASS use the GoDaddy mailbox credentials.';
  if (smtpError?.code === 'ESOCKET' || smtpError?.code === 'ECONNECTION' || smtpError?.code === 'ETIMEDOUT') return 'Could not connect securely to the SMTP server. Verify SMTP_HOST and SMTP_PORT.';
  if (smtpError?.code === 'EENVELOPE') return 'The SMTP provider rejected the configured sender address. Verify SMTP_FROM matches the authenticated mailbox.';
  return 'The SMTP provider rejected the message. Review the Vercel Function log for the provider response.';
}
function renderEmail(ticket: Ticket, event: EmailEvent, actor: Profile, recipient: Profile, portalUrl: string): { subject: string; html: string; text: string } {
  const label = eventLabels[event.event_type] ?? 'Ticket updated';
  const subject = `${ticket.ticket_number} · ${label}`;
  const safeDetail = escapeHtml(event.detail).replace(/\n/g, '<br>');
  const ticketUrl = `${portalUrl.replace(/\/$/, '')}/portal.html`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,Helvetica,sans-serif;color:#17333e">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f8;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#ffffff;border:1px solid #dfe9e8;border-radius:16px;overflow:hidden;box-shadow:0 12px 35px rgba(16,57,67,.08)">
      <tr><td style="background:linear-gradient(110deg,#126b73,#16866f);padding:24px 30px;color:#ffffff">
        <div style="font-size:22px;font-weight:700;letter-spacing:.2px">Simplicon Tax Advisors</div>
        <div style="margin-top:5px;font-size:13px;opacity:.86">Secure Client Workspace</div>
      </td></tr>
      <tr><td style="padding:30px">
        <div style="display:inline-block;background:#e9f7f2;color:#126b5f;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${escapeHtml(label)}</div>
        <h1 style="font-size:24px;line-height:1.3;margin:18px 0 8px;color:#123846">Hello ${escapeHtml(recipient.full_name || 'there')},</h1>
        <p style="font-size:15px;line-height:1.7;margin:0 0 22px;color:#516a73">There is a new update on your Simplicon Tax request.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fafb;border:1px solid #e2eceb;border-radius:12px">
          <tr><td style="padding:18px 20px;border-bottom:1px solid #e2eceb"><strong style="color:#173f4d">${escapeHtml(ticket.ticket_number)} · ${escapeHtml(ticket.subject)}</strong></td></tr>
          <tr><td style="padding:14px 20px;font-size:13px;color:#58717a">${escapeHtml(ticket.country)} &nbsp;·&nbsp; Tax year ${ticket.tax_year} &nbsp;·&nbsp; ${escapeHtml(titleCase(ticket.status))} &nbsp;·&nbsp; ${escapeHtml(ticket.priority)} priority</td></tr>
        </table>
        <div style="margin:22px 0;background:#f0f8f7;border-left:4px solid #16866f;border-radius:4px 10px 10px 4px;padding:17px 18px;font-size:15px;line-height:1.65;color:#294c57">${safeDetail}</div>
        <p style="margin:0 0 24px;font-size:13px;color:#6b8087">Updated by ${escapeHtml(actor.full_name)} on ${new Date(event.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.</p>
        <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#167f70;color:#ffffff;text-decoration:none;border-radius:9px;padding:13px 20px;font-size:14px;font-weight:700">Open secure workspace</a>
        <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#7b8d93">For your security, documents are not attached to email. Sign in to the secure workspace to review messages and files.</p>
      </td></tr>
      <tr><td style="background:#f7fafb;border-top:1px solid #e2eceb;padding:18px 30px;font-size:11px;line-height:1.6;color:#789097">Simplicon Tax Advisors · This is an automated service notification. Reply to this email to contact our team.</td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = `Hello ${recipient.full_name || 'there'},\n\n${label} on ${ticket.ticket_number} · ${ticket.subject}\n\n${event.detail}\n\nStatus: ${titleCase(ticket.status)}\nPriority: ${ticket.priority}\nUpdated by: ${actor.full_name}\n\nOpen the secure workspace: ${ticketUrl}\n\nFor your security, documents are not attached to email.\n\nSimplicon Tax Advisors`;
  return { subject, html, text };
}

export default {
  async fetch(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } });
  try {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const smtpHost = process.env.SMTP_HOST ?? 'smtpout.secureserver.net';
    const smtpPort = Number(process.env.SMTP_PORT ?? '465');
    const smtpUser = process.env.SMTP_USER ?? 'info@simplicontax.com';
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM ?? 'info@simplicontax.com';
    const portalUrl = process.env.PORTAL_URL ?? 'https://www.simplicontax.com';
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Server-side Supabase credentials are not configured');
    if (!smtpPass) throw new Error('SMTP_PASS is not configured');

    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization');
    const { ticketId } = await request.json();
    if (typeof ticketId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ticketId)) throw new Error('A valid ticket ID is required');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !user) throw new Error('Invalid session');

    const [{ data: caller }, { data: ticket }] = await Promise.all([
      adminClient.from('profiles').select('id,email,full_name,role,active').eq('id', user.id).single(),
      adminClient.from('tickets').select('id,ticket_number,subject,country,tax_year,status,priority,requester_id,assigned_to').eq('id', ticketId).single(),
    ]);
    if (!caller || !caller.active || !ticket) throw new Error('Ticket or active profile not found');
    const isParticipant = caller.role === 'admin' || ticket.requester_id === caller.id || (caller.role === 'team' && ticket.assigned_to === caller.id);
    if (!isParticipant) throw new Error('You do not have access to this ticket');

    const { data: queuedEvents, error: eventsError } = await adminClient.from('ticket_email_events')
      .select('id,ticket_id,actor_id,event_type,detail,created_at,attempts')
      .eq('ticket_id', ticketId).eq('actor_id', caller.id).is('processed_at', null)
      .order('created_at', { ascending: true }).limit(20);
    const queueAvailable = !eventsError;
    let events = queuedEvents as EmailEvent[] | null;
    if (eventsError) {
      if (!notificationQueueIsUnavailable(eventsError)) throw eventsError;
      console.warn('Ticket notification queue is unavailable; sending the latest activity directly. Apply the ticket email notification migration to enable delivery tracking.', eventsError.message);
      const { data: activity, error: activityError } = await adminClient.from('ticket_comments')
        .select('id,ticket_id,author_id,body,is_system,created_at')
        .eq('ticket_id', ticketId).eq('author_id', caller.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (activityError) throw activityError;
      if (!activity) throw new Error('No ticket activity is available for notification');
      const typedActivity = activity as TicketActivity;
      events = [{ id: typedActivity.id, ticket_id: typedActivity.ticket_id, actor_id: typedActivity.author_id, event_type: activityEventType(typedActivity), detail: typedActivity.body, created_at: typedActivity.created_at, attempts: 0 }];
    }

    if (!events?.length) return Response.json({ message: 'No pending notifications', sent: 0 }, { headers: corsHeaders });

    const { data: profiles, error: profilesError } = await adminClient.from('profiles').select('id,email,full_name,role,active').eq('active', true);
    if (profilesError) throw profilesError;
    const activeProfiles = (profiles ?? []) as Profile[];
    const requester = activeProfiles.find((profile) => profile.id === ticket.requester_id);
    const assigned = activeProfiles.find((profile) => profile.id === ticket.assigned_to);
    const administrator = activeProfiles.find((profile) => profile.role === 'admin' && profile.email.toLowerCase() === 'info@simplicontax.com');
    if (!requester || !administrator) throw new Error('Ticket recipients are not configured');

    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } });
    let sent = 0;
    let failed = 0;
    let failureDetail = '';
    for (const event of events) {
      const recipients = caller.role === 'client'
        ? [administrator, ...(assigned?.role === 'team' ? [assigned] : [])]
        : [requester, ...(event.event_type === 'assignment_changed' && assigned?.role === 'team' ? [assigned] : [])];
      const uniqueRecipients = [...new Map(recipients.filter((profile) => profile.id !== caller.id).map((profile) => [profile.email.toLowerCase(), profile])).values()];
      let eventComplete = true;
      for (const recipient of uniqueRecipients) {
        const normalizedEmail = recipient.email.toLowerCase();
        let existing: { id: string; sent_at: string | null; attempts: number } | null = null;
        if (queueAvailable) {
          const { data, error: deliveryLookupError } = await adminClient.from('ticket_email_deliveries').select('id,sent_at,attempts').eq('event_id', event.id).eq('recipient_email', normalizedEmail).maybeSingle();
          if (deliveryLookupError) throw deliveryLookupError;
          existing = data;
        }
        if (existing?.sent_at) continue;
        const attempts = Number(existing?.attempts ?? 0) + 1;
        const delivery = renderEmail(ticket as Ticket, event, caller as Profile, recipient, portalUrl);
        try {
          await transporter.sendMail({ from: `"Simplicon Tax Advisors" <${smtpFrom}>`, replyTo: 'info@simplicontax.com', to: normalizedEmail, subject: delivery.subject, text: delivery.text, html: delivery.html });
          if (queueAvailable) await adminClient.from('ticket_email_deliveries').upsert({ event_id: event.id, recipient_email: normalizedEmail, attempts, sent_at: new Date().toISOString(), last_error: null }, { onConflict: 'event_id,recipient_email' });
          sent += 1;
        } catch (sendError) {
          eventComplete = false;
          failed += 1;
          failureDetail ||= smtpFailureDetail(sendError);
          if (queueAvailable) await adminClient.from('ticket_email_deliveries').upsert({ event_id: event.id, recipient_email: normalizedEmail, attempts, last_error: sendError instanceof Error ? sendError.message.slice(0, 1000) : 'SMTP delivery failed' }, { onConflict: 'event_id,recipient_email' });
        }
      }
      if (queueAvailable) await adminClient.from('ticket_email_events').update({ attempts: event.attempts + 1, processed_at: eventComplete ? new Date().toISOString() : null, last_error: eventComplete ? null : 'One or more recipients could not be reached' }).eq('id', event.id);
    }
    if (failed) return Response.json({ error: 'One or more notification emails could not be sent', detail: failureDetail, sent, failed }, { status: 502, headers: corsHeaders });
    return Response.json({ message: `${sent} notification email${sent === 1 ? '' : 's'} sent`, sent }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401
      : message === 'A valid ticket ID is required' ? 400
      : message === 'You do not have access to this ticket' ? 403
      : message === 'Ticket or active profile not found' ? 404
      : message.includes('not configured') ? 503
      : 500;
    console.error('Ticket notification request failed:', message);
    const publicMessage = status === 500 ? 'Notification service encountered an unexpected error' : message;
    return Response.json({ error: publicMessage }, { status, headers: corsHeaders });
  }
  },
};
