# Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using Project Settings → API.
3. Run the migrations in filename order in the SQL editor or with the Supabase CLI:
   - `supabase/migrations/202608200001_simplicon_workspace.sql`
   - `supabase/migrations/202608200002_expand_ticket_statuses.sql`
   - `supabase/migrations/202608200003_ticket_email_notifications.sql`
   - `supabase/migrations/202608200004_organizer_and_document_retention.sql`
   - `supabase/migrations/202608200005_user_lifecycle_and_document_delete.sql`
   - `supabase/migrations/202609020006_social_and_phone_auth.sql`
4. Create the admin Auth user with the email `info@simplicontax.com`, then promote that exact account once in the SQL editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where lower(email) = 'info@simplicontax.com');
   ```

   Confirm that exactly one row changed before opening public registration. New Auth users always start as Clients, preventing someone from gaining Admin merely by registering the admin email first.
5. Deploy the Team invitation and lifecycle functions:

   ```sh
   supabase functions deploy invite-team-member --project-ref akhspwdezqesikfzymth --use-api
   supabase functions deploy manage-team-member --project-ref akhspwdezqesikfzymth --use-api
   ```

   Ticket emails are handled by the Vercel function in `api/ticket-notification.ts` and deploy automatically with the site.
6. Add the production portal URL and `http://127.0.0.1:2323/portal.html` to Authentication → URL Configuration → Redirect URLs while testing locally.
7. Customize the Supabase Invite and Reset Password email templates with Simplicon branding.

## Google, Apple, and phone client sign-in

Run migration 202609020006_social_and_phone_auth.sql before enabling phone sign-in. It allows a legitimate phone-only Auth user to have a Client profile without inventing an email address. Authorization remains controlled by public.profiles; all newly created social and phone users receive the client role, while Team accounts still require an administrator invitation.

1. In **Authentication → URL Configuration**, set the Site URL to the production website and add these Redirect URLs:
   - https://www.simplicontax.com/portal.html
   - http://127.0.0.1:2323/portal.html while testing locally
   - Add the exact Vercel preview URL only when a preview needs auth testing.
2. In **Authentication → Sign In / Providers → Google**, enable Google and enter the Web Client ID and Client Secret from Google Auth Platform. In Google, use the Supabase callback URL shown on that provider page (for this project it is https://akhspwdezqesikfzymth.supabase.co/auth/v1/callback) as an Authorized redirect URI.
3. In **Authentication → Sign In / Providers → Apple**, enable Apple and enter the Services ID/client ID plus the secret generated from the Apple Team ID, Key ID, and Sign in with Apple private key. Configure the same Supabase callback URL as the website return URL in Apple Developer.
4. In **Authentication → Sign In / Providers → Phone**, enable phone sign-in and phone sign-ups, then configure a supported SMS provider such as Twilio, MessageBird, Vonage, or TextLocal. Phone numbers must be entered in E.164 format, such as +14243025536.

Google, Apple, and SMS provider secrets belong only in the provider dashboards and Supabase Authentication settings. Do not add them to Vite or commit them to this repository. Test each provider with a new Client account and confirm the user appears in Portal → Users → Clients before production launch.

## Sending email from info@simplicontax.com

Authentication emails are sent by Supabase Auth, including client confirmation, password recovery, and Team invitations. For the Simplicon GoDaddy Professional Email / Titan mailbox, configure **Supabase → Authentication → SMTP Settings** with:

- Sender email: `info@simplicontax.com`
- Sender name: `Simplicon Tax Advisors`
- SMTP host: `smtpout.secureserver.net`
- SMTP port: `465`
- SMTP security: SSL/TLS
- SMTP username: `info@simplicontax.com`
- SMTP password: the mailbox password (enter it only in Supabase; never commit it to this repository)

These values apply to GoDaddy Professional Email and Professional Email powered by Titan. If the mailbox is a GoDaddy Microsoft 365 plan, use that plan's Microsoft 365 SMTP settings instead.

Vercel environment variables alone cannot change the sender for Supabase Auth emails. This section applies only to account confirmation, password recovery, and Team invitation emails. Ticket activity emails are sent directly by Vercel as described below.

## Ticket update emails

The Vercel function at `api/ticket-notification.ts` sends a corporate HTML and plain-text email after new requests, comments, document uploads, assignments, and workflow changes. Recipient routing is calculated server-side:

- A Client update is sent to `info@simplicontax.com` and the assigned active Team member.
- An Administrator or assigned Team update is sent to the Client.
- A new assignment is also sent to the newly assigned Team member.
- Documents remain inside the secure portal and are never attached to notification emails.

Add these values in **Vercel → Project → Settings → Environment Variables** for Production, Preview, and Development as appropriate:

- `SUPABASE_URL=https://akhspwdezqesikfzymth.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=` the Supabase server-only service-role/secret key
- `SMTP_HOST=smtpout.secureserver.net`
- `SMTP_PORT=465`
- `SMTP_USER=info@simplicontax.com`
- `SMTP_PASS=` the GoDaddy mailbox password
- `SMTP_FROM=info@simplicontax.com`
- `CONTACT_TO=info@simplicontax.com` (optional website enquiry recipient)
- `PORTAL_URL=https://www.simplicontax.com`

Never prefix `SMTP_PASS` or `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`; that would expose them to the browser. Do not commit either secret to the repository. The email queue and per-recipient delivery log prevent repeat emails when a portal action is retried. Use `vercel dev` when testing the API locally because the standalone Vite server does not serve the `/api` function.

## Access model

- `info@simplicontax.com` is the sole administrator. New client requests enter its queue, and only this account can invite Team members or assign tickets.
- Clients can create and read only their own tickets, comments, and documents.
- Team members can read only tickets assigned to them, comment, upload typed drafts, and update workflow status and priority.
- The administrator can freeze, restore, or remove Team access from Portal → Users → Team. Removal is intentionally an auditable soft removal: assigned tickets return to the administrator queue while historical comments and document attribution remain intact.
- The Users directory lists every Client and Team member for the administrator. Clients cannot see this directory.
- Clients can permanently delete only documents they uploaded to their own tickets. The administrator can delete any ticket document; Team members cannot delete documents.
- The document bucket is private. Downloads use short-lived signed URLs, uploads are capped at 50 MB, and video, executable, script, macro-enabled, and active-content file types are denied in both the browser and Storage RLS policy.

Before production launch, add malware scanning for uploaded archives and documents through a Storage webhook or scanning service. Extension and MIME blocking is defense-in-depth, not a substitute for content scanning.

The service-role/secret key is used only inside the Vercel server function and must never be added to a `VITE_` variable or the browser bundle.

## Tax organizer and 30-day document retention

The fourth migration creates a private `tax-organizers` bucket and a singleton metadata record for the current Excel organizer. Every authenticated role can create a short-lived signed download. Only the active administrator account `info@simplicontax.com` can upload or replace the file from Portal → Tax organizer.

After running the migration, sign in as the administrator, open **Tax organizer**, and choose **Upload organizer**. This moves the live organizer workflow entirely to Supabase; the website no longer links to a public spreadsheet.

Ticket documents are eligible for permanent deletion 30 days after `closed_at`. Reopening a completed ticket clears `closed_at` and pauses the countdown. Deploy and schedule the cleanup function as follows:

1. Generate a long random retention secret and store it without committing it:

   ```sh
   supabase secrets set DOCUMENT_RETENTION_SECRET=your-long-random-secret
   ```

2. Deploy the function with its custom secret check:

   ```sh
   supabase functions deploy purge-expired-documents --no-verify-jwt
   ```

3. In Supabase Dashboard → Integrations → Cron, create a daily Edge Function job for `purge-expired-documents` using `POST` (for example, at 02:00 UTC). Add the header `x-document-retention-secret` with the same secret.

The function processes at most 1,000 eligible records per run, deletes each object through the Supabase Storage API, writes an administrator-only audit row, and then deletes its `ticket_documents` metadata. Never replace this with direct SQL deletion from `storage.objects`, because that would orphan the underlying file.
