# Deploy Simplicon Website

The site is built and ready to deploy.

## Vercel

The site is already live on Vercel, and Vercel is connected to the Git repository. Just make your changes and push them to the main branch. Vercel will automatically build and deploy the latest version, and the live site will update once the deployment is successful. No manual deployment or GoDaddy changes are needed.
## Ticket email notifications

The `/api/ticket-notification` Vercel Function sends workspace notifications after ticket, comment, assignment, or document activity. Configure these **server-only** environment variables in Vercel for Production (and Preview if you use previews):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_PASS`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_FROM` when they differ from the GoDaddy defaults in `.env.example`
- `PORTAL_URL=https://www.simplicontax.com`

Do not prefix any of these variables with `VITE_`; the service-role key and SMTP password must never reach the browser. Apply the Supabase notification migrations, including `202608200003_ticket_email_notifications.sql`, before enabling the endpoint. A missing deployment setting returns HTTP 503, while invalid requests, sessions, access, and unexpected failures return their correct status codes.
