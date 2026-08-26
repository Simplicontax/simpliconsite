import nodemailer from 'nodemailer';
import process from 'node:process';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ContactRequest = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

function clean(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } });
    }

    try {
      const body = await request.json() as ContactRequest;
      if (clean(body.website, 200)) return Response.json({ ok: true }, { headers: corsHeaders });

      const name = clean(body.name, 120);
      const email = clean(body.email, 254).toLowerCase();
      const phone = clean(body.phone, 40);
      const subject = clean(body.subject, 80) || 'General tax enquiry';
      const message = clean(body.message, 4000);
      if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json({ error: 'Please provide a valid name, email address and message.' }, { status: 400, headers: corsHeaders });
      }

      const smtpHost = process.env.SMTP_HOST ?? 'smtpout.secureserver.net';
      const smtpPort = Number(process.env.SMTP_PORT ?? '465');
      const smtpUser = process.env.SMTP_USER ?? 'info@simplicontax.com';
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM ?? 'info@simplicontax.com';
      const contactTo = process.env.CONTACT_TO ?? 'info@simplicontax.com';
      if (!smtpPass) {
        return Response.json({ error: 'Email service is not configured.' }, { status: 503, headers: corsHeaders });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safePhone = escapeHtml(phone || 'Not provided');
      const safeSubject = escapeHtml(subject);
      const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
      const mailSubject = 'Website enquiry - ' + subject + ' - ' + name;
      const html = '<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,Helvetica,sans-serif;color:#17333e">' +
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center">' +
        '<table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;overflow:hidden;border:1px solid #dfe9e8;border-radius:16px;background:#fff">' +
        '<tr><td style="padding:24px 30px;color:#fff;background:#126b73"><div style="font-size:22px;font-weight:700">Simplicon Tax Advisors</div><div style="margin-top:5px;font-size:13px;opacity:.86">New website enquiry</div></td></tr>' +
        '<tr><td style="padding:30px"><h1 style="margin:0 0 20px;font-size:24px;color:#123846">' + safeSubject + '</h1>' +
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2eceb;border-radius:12px;background:#f7fafb">' +
        '<tr><td style="padding:12px 18px;border-bottom:1px solid #e2eceb"><strong>Name</strong><br>' + safeName + '</td></tr>' +
        '<tr><td style="padding:12px 18px;border-bottom:1px solid #e2eceb"><strong>Email</strong><br><a href="mailto:' + safeEmail + '" style="color:#126b73">' + safeEmail + '</a></td></tr>' +
        '<tr><td style="padding:12px 18px"><strong>Phone</strong><br>' + safePhone + '</td></tr></table>' +
        '<div style="margin-top:20px;padding:18px;border-left:4px solid #16866f;border-radius:4px 10px 10px 4px;background:#f0f8f7;line-height:1.65">' + safeMessage + '</div>' +
        '<p style="margin:24px 0 0;font-size:12px;color:#71878f">Reply to this email to contact the prospective client.</p></td></tr>' +
        '<tr><td style="padding:18px 30px;border-top:1px solid #e2eceb;background:#f7fafb;font-size:11px;color:#789097">Simplicon Tax Advisors - Website enquiry</td></tr>' +
        '</table></td></tr></table></body></html>';
      const text = 'New website enquiry\n\nFiling country: ' + subject + '\nName: ' + name + '\nEmail: ' + email + '\nPhone: ' + (phone || 'Not provided') + '\n\n' + message;

      await transporter.sendMail({
        from: '"Simplicon Tax Advisors" <' + smtpFrom + '>',
        to: contactTo,
        replyTo: email,
        subject: mailSubject,
        text,
        html,
      });

      return Response.json({ ok: true }, { headers: corsHeaders });
    } catch {
      return Response.json({ error: 'We could not send your enquiry. Please email info@simplicontax.com.' }, { status: 500, headers: corsHeaders });
    }
  },
};
