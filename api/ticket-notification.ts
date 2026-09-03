import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import process from 'node:process';

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
  return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
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
  const e = error as { code?: string; responseCode?: number } | null;
  if (e?.code === 'EAUTH' || e?.responseCode === 535) return 'SMTP login was rejected. Verify SMTP_USER and SMTP_PASS.';
  if (e?.code === 'ESOCKET' || e?.code === 'ECONNECTION' || e?.code === 'ETIMEDOUT') return 'Could not connect to SMTP server. Verify SMTP_HOST and SMTP_PORT.';
  if (e?.code === 'EENVELOPE') return 'SMTP rejected sender address. Verify SMTP_FROM matches the authenticated mailbox.';
  return 'SMTP provider rejected the message. Review Vercel Function logs.';
}

function renderEmail(ticket: Ticket, event: EmailEvent, actor: Profile, recipient: Profile, portalUrl: string): { subject: string; html: string; text: string } {
  const label = eventLabels[event.event_type] ?? 'Ticket updated';
  const subject = ticket.ticket_number + ' · ' + label;
  const safeDetail = escapeHtml(event.detail).replace(/\n/g, '<br>');
  const siteUrl = portalUrl.replace(/\/$/, '');
  const ticketUrl = siteUrl + '/portal.html';
  const logoUrl = siteUrl + '/simplicon-logo-transparent.png';
  const html = '<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,Helvetica,sans-serif;color:#183c47">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 12px"><tr><td align="center">' +
    '<table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #d9e6e5;border-radius:18px;overflow:hidden">' +
    '<tr><td style="padding:20px 30px;background:#0c4d58"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:56px;height:56px;border-radius:28px;background:#ffffff;text-align:center;vertical-align:middle"><img src="' + escapeHtml(logoUrl) + '" width="42" alt="Simplicon Tax Advisors" style="display:inline-block;width:42px;max-width:42px;height:auto;border:0"></td></tr></table></td></tr>' +
    '<tr><td style="height:5px;background:#16a184;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:34px 30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#11786d">' + escapeHtml(label) + '</div>' +
    '<h1 style="margin:12px 0 8px;font-size:27px;line-height:1.25;color:#123846">Hello ' + escapeHtml(recipient.full_name || 'there') + ',</h1>' +
    '<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#587078">There is an update in your secure Simplicon Tax workspace.</p>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce9e8;border-radius:12px;background:#f8fbfb"><tr><td style="padding:17px 18px;border-bottom:1px solid #dce9e8;font-size:15px;line-height:1.45;color:#173f4d"><strong>' + escapeHtml(ticket.ticket_number) + '</strong><br><span style="color:#5d747b">' + escapeHtml(ticket.subject) + '</span></td></tr><tr><td style="padding:13px 18px;font-size:12px;line-height:1.55;color:#60777e">' + escapeHtml(ticket.country) + ' &nbsp;•&nbsp; Tax year ' + ticket.tax_year + ' &nbsp;•&nbsp; ' + escapeHtml(titleCase(ticket.status)) + ' &nbsp;•&nbsp; ' + escapeHtml(ticket.priority) + ' priority</td></tr></table>' +
    '<div style="margin:22px 0 25px;padding:18px 18px 18px 20px;border-left:4px solid #16a184;border-radius:4px 10px 10px 4px;background:#eff8f6;font-size:15px;line-height:1.65;color:#294c57">' + safeDetail + '</div>' +
    '<p style="margin:0 0 23px;font-size:12px;line-height:1.6;color:#71868c">Updated by ' + escapeHtml(actor.full_name || 'A Simplicon Tax team member') + ' on ' + new Date(event.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC.</p>' +
    '<a href="' + escapeHtml(ticketUrl) + '" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#117d70;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Open secure workspace</a><p style="margin:25px 0 0;font-size:12px;line-height:1.6;color:#71868c">For your privacy, documents are never attached to notification emails.</p></td></tr>' +
    '<tr><td style="padding:18px 30px;background:#f7faf9;border-top:1px solid #dce9e8;font-size:11px;line-height:1.6;color:#71868c">Simplicon Tax Advisors · Secure tax support for the U.S. and India<br><a href="' + escapeHtml(siteUrl) + '" style="color:#11786d;text-decoration:none">' + escapeHtml(siteUrl.replace(/^https?:\/\//, '')) + '</a></td></tr></table></td></tr></table></body></html>';
  const text = 'Simplicon Tax Advisors\n\n' + label + '\n\nHello ' + (recipient.full_name || 'there') + ',\n\n' + ticket.ticket_number + ' · ' + ticket.subject + '\n' + ticket.country + ' · Tax year ' + ticket.tax_year + ' · ' + titleCase(ticket.status) + ' · ' + ticket.priority + ' priority\n\n' + event.detail + '\n\nOpen your secure workspace: ' + ticketUrl + '\n\nFor your privacy, documents are not attached to notification emails.';
  return { subject, html, text };
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const smtpHost = process.env.SMTP_HOST ?? 'smtpout.secureserver.net';
    const smtpPort = Number(process.env.SMTP_PORT ?? '465');
    const smtpUser = process.env.SMTP_USER ?? 'info@simplicontax.com';
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM ?? 'info@simplicontax.com';
    const ticketReplyTo = process.env.TICKET_REPLY_TO ?? 'tickets@simplicontax.com';
    const portalUrl = process.env.PORTAL_URL ?? 'https://www.simplicontax.com';
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Server-side Supabase credentials are not configured');
    if (!smtpPass) throw new Error('SMTP_PASS is not configured');

    const authorization = req.headers['authorization'] as string | undefined;
    if (!authorization) throw new Error('Missing authorization');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { ticketId } = body as { ticketId: unknown };
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
      console.warn('Notification queue unavailable; falling back to latest activity.', eventsError.message);
      const { data: activity, error: activityError } = await adminClient.from('ticket_comments')
        .select('id,ticket_id,author_id,body,is_system,created_at')
        .eq('ticket_id', ticketId).eq('author_id', caller.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (activityError) throw activityError;
      if (!activity) throw new Error('No ticket activity is available for notification');
      const a = activity as TicketActivity;
      events = [{ id: a.id, ticket_id: a.ticket_id, actor_id: a.author_id, event_type: activityEventType(a), detail: a.body, created_at: a.created_at, attempts: 0 }];
    }

    if (!events?.length) return res.status(200).json({ message: 'No pending notifications', sent: 0 });

    const { data: profiles, error: profilesError } = await adminClient.from('profiles').select('id,email,full_name,role,active').eq('active', true);
    if (profilesError) throw profilesError;
    const activeProfiles = (profiles ?? []) as Profile[];
    const requester = activeProfiles.find((p) => p.id === ticket.requester_id);
    const assigned = activeProfiles.find((p) => p.id === ticket.assigned_to);
    const administrator = activeProfiles.find((p) => p.role === 'admin' && p.email.toLowerCase() === 'info@simplicontax.com');
    if (!requester || !administrator) throw new Error('Ticket recipients are not configured');

    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } });
    let sent = 0;
    let failed = 0;
    let failureDetail = '';
    for (const event of events) {
      const recipients = caller.role === 'client'
        ? [administrator, ...(assigned?.role === 'team' ? [assigned] : [])]
        : [requester, ...(event.event_type === 'assignment_changed' && assigned?.role === 'team' ? [assigned] : [])];
      const uniqueRecipients = [...new Map(recipients.filter((p) => p.id !== caller.id).map((p) => [p.email.toLowerCase(), p])).values()];
      let eventComplete = true;
      for (const recipient of uniqueRecipients) {
        const normalizedEmail = recipient.email.toLowerCase();
        let existing: { id: string; sent_at: string | null; attempts: number } | null = null;
        if (queueAvailable) {
          const { data, error: dlErr } = await adminClient.from('ticket_email_deliveries').select('id,sent_at,attempts').eq('event_id', event.id).eq('recipient_email', normalizedEmail).maybeSingle();
          if (dlErr) throw dlErr;
          existing = data;
        }
        if (existing?.sent_at) continue;
        const attempts = Number(existing?.attempts ?? 0) + 1;
        const delivery = renderEmail(ticket as Ticket, event, caller as Profile, recipient, portalUrl);
        try {
          await transporter.sendMail({ from: `"Simplicon Tax Advisors" <${smtpFrom}>`, replyTo: ticketReplyTo, to: normalizedEmail, subject: delivery.subject, text: delivery.text, html: delivery.html });
          if (queueAvailable) await adminClient.from('ticket_email_deliveries').upsert({ event_id: event.id, recipient_email: normalizedEmail, attempts, sent_at: new Date().toISOString(), last_error: null }, { onConflict: 'event_id,recipient_email' });
          sent += 1;
        } catch (sendError) {
          eventComplete = false;
          failed += 1;
          const smtpError = sendError as { code?: string; responseCode?: number; command?: string } | null;
          console.error('Ticket notification SMTP delivery failed', {
            code: smtpError?.code ?? 'unknown',
            responseCode: smtpError?.responseCode ?? 'unknown',
            command: smtpError?.command ?? 'unknown',
            message: sendError instanceof Error ? sendError.message : 'Unknown SMTP error',
          });
          failureDetail ||= smtpFailureDetail(sendError);
          if (queueAvailable) await adminClient.from('ticket_email_deliveries').upsert({ event_id: event.id, recipient_email: normalizedEmail, attempts, last_error: sendError instanceof Error ? sendError.message.slice(0, 1000) : 'SMTP delivery failed' }, { onConflict: 'event_id,recipient_email' });        }
      }
      if (queueAvailable) await adminClient.from('ticket_email_events').update({ attempts: event.attempts + 1, processed_at: eventComplete ? new Date().toISOString() : null, last_error: eventComplete ? null : 'One or more recipients could not be reached' }).eq('id', event.id);
    }
    if (failed) return res.status(502).json({ error: 'One or more notification emails could not be sent', detail: failureDetail, sent, failed });
    return res.status(200).json({ message: `${sent} notification email${sent === 1 ? '' : 's'} sent`, sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401
      : message === 'A valid ticket ID is required' ? 400
      : message === 'You do not have access to this ticket' ? 403
      : message === 'Ticket or active profile not found' ? 404
      : message.includes('not configured') ? 503
      : 500;
    console.error('Ticket notification request failed:', message);
    return res.status(status).json({ error: status === 500 ? 'Notification service encountered an unexpected error' : message });
  }
}
