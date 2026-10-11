# Re·Form Pilates: booking app

A mobile-first booking app for Re·Form Pilates Studio (Limassol). Clients can book reformer, mat and special-event classes, pay or use class credits, join waitlists and manage their bookings. The instructor gets a phone-first admin with check-ins, a timetable builder, clients, messages and stats.

Built with Next.js 16, Supabase (Postgres + Auth, EU), Stripe Checkout, Resend and Twilio. See `CLAUDE.md` for brand rules, studio rules and every design decision.

---

## Deploy a preview (about 15 minutes, no coding)

You'll create two free accounts: **Supabase** (database and login) and **Vercel** (hosting). Keys go into Vercel's encrypted settings, never into chat or the code.

### 1. Supabase (EU)
1. Go to https://supabase.com, sign in with GitHub, then click **New project**.
   - **Name:** `reform-preview`
   - **Database password:** generate one and save it in your password manager.
   - **Region:** **Central EU (Frankfurt)**
2. When the project is ready, open **SQL Editor → New query**. Paste the whole contents of [`supabase/setup.sql`](supabase/setup.sql) from this repo and click **Run**. It creates the tables, security rules and demo data, and should end with "Success".
3. Open **Authentication → Sign In / Providers → Email**:
   - Set **Email OTP Length** to **6**.
   - Under **User Signups**, turn **off** "Allow new users to sign up". The app creates accounts itself, so this blocks sign-ups that bypass it.
4. Open **Project Settings → API Keys** and keep this tab open for step 2. You need:
   - **Project URL** (Project Settings → Data API)
   - the **publishable / anon** key
   - the **secret / service_role** key. Treat it like a password.

### 2. Vercel
1. Go to https://vercel.com, sign in with GitHub, then **Add New… → Project** and import **petridesart-cloud/owner**.
2. Before clicking Deploy, open **Environment Variables** and add these (apply to Production and Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable / anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret / service_role key |
   | `DEMO_MODE` | `true` |
   | `ADMIN_EMAILS` | the email Elysia (and you) will sign in with, comma-separated |
   | `DEMO_ADMIN_CODE` | a private 8–12 digit number. This is the admin "password" on the demo |
   | `CRON_SECRET` | any long random string |

   Leave Stripe, Resend and Twilio empty for now. The app uses a test checkout and logs messages to the admin Outbox.
3. Click **Deploy**. When it's done, Vercel shows your link (`https://….vercel.app`). If the deploy branch isn't `claude/pilates-booking-app-sk3trx`, open the project's **Deployments** tab and deploy that branch, or merge the PR first.
4. Optional: in **Settings → Environment Variables**, add `NEXT_PUBLIC_SITE_URL` = your Vercel link, then redeploy. This makes links in emails absolute.

### 3. Test it
- **Client:** open the link on your phone, tap **Secure your spot** and enter any email. In demo mode the 6-digit code appears on screen.
- **Admin:** sign in with an email from `ADMIN_EMAILS`. Instead of a code, enter your `DEMO_ADMIN_CODE`.
- **Returning-client demo:** sign in as `elena@example.com`, who has history, credits and a booking.
- **Admin → Settings → Reset demo data** rebuilds fresh demo data any time.

See [`docs/how-to-test.md`](docs/how-to-test.md) for the guided walkthrough.

### Going live later (checklist in Admin → Compliance)
- **Stripe:** add `STRIPE_SECRET_KEY`, then create a webhook to `https://<domain>/api/stripe/webhook` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`, enable Apple Pay / Google Pay and verify the domain.
- **Resend:** verify the studio domain (SPF/DKIM), then set `RESEND_API_KEY` and `EMAIL_FROM`.
- **Scheduler:** call `GET /api/cron/tick` every 5 minutes with header `Authorization: Bearer $CRON_SECRET` (Supabase → Integrations → Cron, or cron-job.org).
- **Switch off demo mode:** set `DEMO_MODE=false`, then reset the database without the demo seed (separate production Supabase project recommended).

---

## Develop locally
```bash
npm install
npx supabase start          # needs Docker
npx supabase db reset       # migrations + demo data
cp .env.example .env.local  # paste the local URL/keys printed by `supabase start`
npm run dev
```
| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | static checks |
| `npm run test:e2e` | Playwright: booking + pay + cancel, waitlist, admin access |
| `npm run db:types` | regenerate `src/lib/supabase/types.ts` after a migration |
| `npm run db:bundle` | regenerate `supabase/setup.sql` for the SQL Editor |

Schema changes always go in a new file in `supabase/migrations/`. Never edit the database by hand.

## Structure
```
supabase/migrations/   schema, booking engine (Postgres functions), RLS, demo seed
src/lib/booking.ts     booking/payment/cancel/waitlist/reminder orchestration
src/lib/payments/      PaymentProvider: stripe | mock | viva (stub)
src/lib/notifications/ email (Resend), sms (Twilio), templates, Outbox logging
src/app/(client)/      client app (home, schedule, book, bookings, account, info, legal)
src/app/admin/         studio admin (requires admin role)
src/app/api/           stripe webhook, cron tick, .ics, data export
e2e/                   Playwright tests
```
