@AGENTS.md

# Re·Form Pilates: booking app

Booking web app for **Re·Form Pilates Studio**, Limassol, Cyprus (Instagram @re_form_es). It's a boutique reformer and mat studio with one instructor (Elysia) and 3 reformers. Bookings currently happen through Instagram DMs. This app replaces that: clients arrive from her Instagram bio link on their phones.

## Brand rules
- **Palette** (tokens in `src/app/globals.css`):
  - lilac `#E9DDF5` → `#C9A8E6`
  - mauve `#D7A3C8`
  - paper `#FBF8FC`
  - concrete `#9A9590` (hairlines only, never text)
  - ink/plum `#2E2238`
  - ink-soft `#5E5566`
  - burgundy `#7A2E3A` (sparingly: errors, "Full")
- **Text contrast:** body text is always ink or ink-soft on paper or lilac (≥ 4.5:1).
- **Type:**
  - Cormorant Garamond (headings, all caps, wide tracking; lining numerals for times).
  - Pinyon Script (accent words only, e.g. "*Reformer* Pilates").
  - Inter (UI).
  - Barlow Condensed (tiny "DAILY MOTIVATION // 001" labels).
- **Feel:** minimal, airy, Apple-like. Rounded cards (22px), frosted headers, soft plum-tinted shadows, subtle motion, and respect `prefers-reduced-motion`.
- **Copy:** short, warm, motivating ("Secure your spot", "See you on the reformer").
  - No medical claims.
  - No "best in Limassol".
  - No fake reviews.
  - No certifications unless real.
- **Images:** only her own photos (with permission) or licensed ones. Placeholders are gradients labelled "photo coming soon".

## Studio rules (all configurable in Admin → Settings)
- **Timezone and money:** Europe/Nicosia, EUR. Money is stored in cents and prices are entered VAT-inclusive. The "VAT registered" toggle (rate default 19%) controls the "incl. VAT" wording.
- **Classes:**
  - Reformer: capacity 3, 50 minutes.
  - Mat: capacity configurable.
  - Events (SUP Pilates, brunch): one-off, with their own price, capacity and location.
- **Cancellation cutoff:** 12h.
  - Before the cutoff, the credit is returned (card-paid single class → credit of the same type).
  - Inside the cutoff, the client can still "release" the spot to the waitlist, but there's no refund.
  - Admin toggle (default off): refund the late-cancel credit if the spot gets re-booked.
- **Waitlist:** the first in line is offered the spot and has 2h, or until the cutoff (if already inside the cutoff, until class start), to claim it. After that it goes to the next person. A live offer reserves the spot.
- **Payment hold:** 10 minutes while paying. A booking is confirmed only after payment succeeds or a credit is deducted.
- **Credits:** per class type (reformer credits / mat credits). Events are paid individually.

## Decisions (and why)
| Decision | Why |
|---|---|
| Email 6-digit code login (no magic links, no passwords) | Instagram's in-app browser breaks magic links. Codes are generated with Supabase Auth's admin `generateLink` and delivered by our own notification service (Resend), so we control the template and demo mode can show them. |
| Demo mode shows client codes on screen, never admin codes | So the preview can be clicked through without email. Admins enter `DEMO_ADMIN_CODE` instead; otherwise anyone could open the admin on a public preview. |
| Booking engine in Postgres functions (`book_session`, `cancel_booking`, `process_waitlist`, …) that `SELECT … FOR UPDATE` the class row | Guarantees no double-booking of the last reformer under concurrency (tested with 6 parallel requests → exactly 3 succeed). |
| Server is the only writer (service role); engine functions executable only by `service_role`; RLS lets clients read only their own rows | Defence in depth if the public anon key is used directly. Health notes: client reads own, instructor reads all, writes server-side so consent is logged. |
| Health note in a separate table with separate explicit consent | GDPR art. 9 special-category data. |
| Waitlist offer reserves the spot (`spots_taken` counts live offers) | The offered person can't be beaten to it while they decide. |
| Payment layer behind `PaymentProvider` (Stripe Checkout today, mock without keys, Viva.com stub) | Viva Wallet is common in Cyprus; Stripe-hosted checkout means no card data touches us. |
| Notification service writes every message to `notifications` (the admin Outbox) and only sends when the provider is configured and demo mode is off | Demo-safe; doubles as a message log. Transactional only; marketing must never go through it. |
| Reminders and waitlist advancing run in `runTick()`: an opportunistic background tick on page views (max once a minute) plus `GET /api/cron/tick` (Bearer `CRON_SECRET`) | Vercel Hobby cron is daily only. In production, call the endpoint every 5 minutes from Supabase pg_cron or an external scheduler. |
| Next.js 16 with `cacheComponents` off | Almost every page is per-user and dynamic; the previous caching model is simpler and fully supported. |
| Map is click-to-load; only essential cookies | ePrivacy: no cookie banner needed, and nothing third-party loads before consent. |
| Demo data is a SQL function (`seed_demo`) relative to `now()`, with admin "Reset demo data" (demo mode only) | The demo always looks current and can be replayed. |
| Login cookies httpOnly | Hardening; we don't use the Supabase browser client. |

## Tech
- **Stack:** Next.js 16 (App Router, `src/`, `proxy.ts` instead of middleware), TypeScript, Tailwind v4, Supabase (Postgres + Auth), Stripe, Resend, Twilio, Playwright.
- **Key files:**
  - `supabase/migrations/*`: schema, engine, RLS, demo seed, hardening. Never change the DB manually; add a migration. `supabase/setup.sql` is a generated bundle (`npm run db:bundle`).
  - `src/lib/booking.ts`: server orchestration (book, pay, cancel, waitlist, reminders) and notifications.
  - `src/lib/auth.ts`: `getViewer`, `requireAdmin`, `getSettings`.
  - `src/lib/payments/*`, `src/lib/notifications/*`: swappable providers.
  - `src/lib/time.ts`: all timezone formatting (UTC stored, Nicosia shown).
  - `src/app/(client)/*`: client app.
  - `src/app/admin/*`: admin. Every server action calls `requireAdmin()` through `admin()` and writes `audit_log`.

## Run & test
```bash
npm install
npx supabase start            # local Postgres + Auth (needs Docker)
npx supabase db reset         # migrations + demo seed
cp .env.example .env.local    # fill in the local keys printed by `supabase start`; DEMO_MODE=true
npm run dev                   # http://localhost:3000
npm run typecheck && npm run lint
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e   # booking, cancel, waitlist, admin access
npm run db:types              # after schema changes
```
- **Admin login (local):** `studio@example.com` with admin code `DEMO_ADMIN_CODE`. Demo clients such as `elena@example.com` show their code on screen.
- **Cloud session note:** start Docker with the proxy env (`HTTPS_PROXY`, `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt`) before `supabase start`.

## Working agreement (from the owner)
- After each phase:
  - screenshot every changed screen at 390px and critique it;
  - run a separate security review (RLS, health data, admin routes);
  - check that tests pass;
  - commit a checkpoint;
  - update this file.
- Ask before anything hard to reverse. Flag v2 candidates instead of overbuilding.

## Current status / next up
- **Done (v1):**
  - Client app: home, schedule, booking, mock and Stripe checkout, confirmation with .ics, My classes (cancel, waitlist, credits), packs, account (export, delete, consents), info and legal placeholder pages.
  - Admin: Today with check-in, classes, class detail (roster, manual add, edit, cancel class), timetable builder, clients, Outbox, stats, CSV/XLSX import, settings, compliance checklist, reset demo.
  - Security review done (see decisions).
  - 4 Playwright tests green.
- **Waiting on the owner:** real logo, photos, prices, policy text, business details; Supabase EU project and Vercel setup (see README).
- **Next (pending owner prioritisation):** benchmark (docs/benchmark.md) → PWA → polish/motion pass → reformer picker → retention automations → reports. Wallet passes, memberships, Greek, webshop and multiple instructors are proposed for v2.
