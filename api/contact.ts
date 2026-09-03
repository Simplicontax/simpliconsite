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
      const siteUrl = (process.env.PORTAL_URL ?? 'https://www.simplicontax.com').replace(/\/$/, '');
      const logoUrl = siteUrl + '/simplicon-logo-transparent.png';
      const html = '<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,Helvetica,sans-serif;color:#183c47">' +
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 12px"><tr><td align="center"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #d9e6e5;border-radius:18px;overflow:hidden">' +
        '<tr><td style="padding:20px 30px;background:#0c4d58"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:56px;height:56px;border-radius:28px;background:#ffffff;text-align:center;vertical-align:middle"><img src="' + logoUrl + '" width="42" alt="Simplicon Tax Advisors" style="display:inline-block;width:42px;max-width:42px;height:auto;border:0"></td></tr></table></td></tr><tr><td style="height:5px;background:#16a184;font-size:0;line-height:0">&nbsp;</td></tr>' +
        '<tr><td style="padding:34px 30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#11786d">New website enquiry</div><h1 style="margin:12px 0 8px;font-size:27px;line-height:1.25;color:#123846">' + safeSubject + '</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#587078">A prospective client has contacted Simplicon Tax Advisors.</p>' +
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce9e8;border-radius:12px;background:#f8fbfb"><tr><td style="padding:13px 18px;border-bottom:1px solid #dce9e8;font-size:13px;line-height:1.55"><strong style="color:#173f4d">Name</strong><br><span style="color:#5d747b">' + safeName + '</span></td></tr><tr><td style="padding:13px 18px;border-bottom:1px solid #dce9e8;font-size:13px;line-height:1.55"><strong style="color:#173f4d">Email</strong><br><a href="mailto:' + safeEmail + '" style="color:#11786d;text-decoration:none">' + safeEmail + '</a></td></tr><tr><td style="padding:13px 18px;font-size:13px;line-height:1.55"><strong style="color:#173f4d">Phone</strong><br><span style="color:#5d747b">' + safePhone + '</span></td></tr></table>' +
        '<div style="margin:22px 0 25px;padding:18px 18px 18px 20px;border-left:4px solid #16a184;border-radius:4px 10px 10px 4px;background:#eff8f6;font-size:15px;line-height:1.65;color:#294c57">' + safeMessage + '</div><a href="mailto:' + safeEmail + '?subject=Re%3A%20' + encodeURIComponent(subject) + '" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#117d70;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Reply to enquiry</a></td></tr>' +
        '<tr><td style="padding:18px 30px;background:#f7faf9;border-top:1px solid #dce9e8;font-size:11px;line-height:1.6;color:#71868c">Simplicon Tax Advisors · Website enquiry<br><a href="' + siteUrl + '" style="color:#11786d;text-decoration:none">' + siteUrl.replace(/^https?:\/\//, '') + '</a></td></tr></table></td></tr></table></body></html>';      const text = 'New website enquiry\n\nFiling country: ' + subject + '\nName: ' + name + '\nEmail: ' + email + '\nPhone: ' + (phone || 'Not provided') + '\n\n' + message;

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
