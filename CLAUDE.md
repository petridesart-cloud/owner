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

## Studio rules (her real policy; settings-driven in Admin → Settings)
- **Timezone and money:**
  - Europe/Nicosia, EUR, all money in cents.
  - Not a registered business yet: no VAT shown anywhere (the VAT and registration fields are hidden and empty).
  - Receipts are plain payment confirmations, never tax invoices.
- **Classes:**
  - Reformer: capacity 3, 50 minutes. Mat: configurable.
  - Events (SUP Pilates, brunch) are paid individually.
  - Each class type has a credit cost (a private session may cost 2–3).
- **Cancellation:** **6h** cutoff.
  - 6h or more before class: the credit goes back to the same package with its original expiry, and the client can rebook.
  - Inside 6h, or a no-show: the credit is forfeited. The client can still release the spot to the waitlist.
  - Admin toggle (default off): refund the credit if the spot gets re-booked.
- **Packages (her real prices):** "N per week × 1 or 2 months" (Reformer €70/130/180/220 and €120/240/300/410; Mat €50/90/120/150 and €85/150/200/260). Classes = per week × 4 × months; "per week" is a guide, not a cap.
  - **Trial** (Reformer €25, Mat €20): only for someone who has never booked that class type. **Drop-in** (€35 / €30). Both reserve the spot with an unpaid payment and the client's chosen method (cash/Revolut); she marks it paid. One unpaid class at a time.
  - Prepaid, 30 or 60 days of validity counted **from the first class**.
  - "Not started yet" until the first booking. Provisional expiry follows the earliest booked class and is locked once that class has passed.
  - Classes can't be booked beyond the expiry date. Unused classes expire (ledger `expiry`).
  - Packages are non-transferable.
  - No auto-renew for now: renewing means buying a new package. The monthly/subscription code is kept behind the online-payments flag and its products are hidden.
- **Pay in advance:**
  - Online payments are OFF and stay locked until the 5 "before online payments" compliance items are ticked (demo mode excepted).
  - Package requests are "awaiting payment" and grant nothing until she taps **Mark as paid** (cash, Revolut, bank or card).
  - Requests expire after 48h and the client is notified.
  - Booking a class before paying is OFF (setting `allow_pay_later`).
  - Payment instructions show cash, her Revolut link and IBAN, with reference `RF-XXXXXX`.
- **Student discount:** 10% on group packages only.
  - She verifies students in person and sets a "verified until" date.
  - Student card images are never stored.
- **Studio-cancelled classes** are always replaced: the credit comes back and the client is invited to rebook.
- **Closures:**
  - Confirmed closures cancel the classes in that range (clients notified and credited) and block booking those days.
  - Started packages are frozen: their expiry extends by the closed days in their window (overlapping closures counted once), recorded as ledger `freeze_extension`.
  - Cyprus public holidays for the next 12 months are preloaded as suggestions she confirms.
  - "Missed class: public holiday" returns a class with a reason.
- **Waitlist:** the first in line gets 2h (or until the cutoff) to claim. A live offer reserves the spot.
- **Booking window:** clients book up to 4 weeks ahead (`booking_window_days`, Settings); the studio can add anyone beyond it.
- **Same days every week:** clients pick weekly slots (`recurring_rules`); `applyRecurring()` books them while the package lasts, inside the window, on save, on Mark as paid, on timetable save and on every tick. Full weeks are skipped with a one-tap waitlist email; classes the client cancelled are never re-booked.
- **Her photos:** Admin → Settings → Photos uploads to the public Storage bucket `media` (table `media`, slots `logo`, `instructor`, `studio:<section>`, `event:<id>`), resized in the browser to ≤1600px. Studio sections are a setting.
- **Client profile:** first name, surname, **date of birth (required, her answer; older clients are asked before their next booking)**, optional goal, emergency contact, injuries and medication (health data, separate consent, instructor only), photo consent (with face / without face / none, logged in `consents` as `photos`). Her roster flags Birthday, First class, Under 18, Trial, Drop-in, No photos / No face.
- **Her texts** are editable by her (Admin → Settings → Your texts, table `site_content`), falling back to the defaults in `src/lib/policy.ts`. They're reused across the policy pages, the first-class welcome, "What to bring", The Magic and Our Studio.
- **Studio team:** she adds or removes admins in Admin → Settings → Studio team (`profiles.role`). `ADMIN_EMAILS` is only the bootstrap.
- **Client navigation:** Home (logo, "Secure your package", next class, Pick classes / Every week, circles Studio · Events · Rules & policies, Next available) · Schedule · My classes (My profile / My progress: current package cards, upcoming, past packages with X/Y) · Account (details, health, photos consent, receipts).
- **Keep it simple:** 5 admin tabs (Today, Classes, Clients, Stats, Settings); less-used tools sit inside Classes and Settings. Settings shows the essentials first, with technical options under "Advanced".

## Decisions (and why)
| Decision | Why |
|---|---|
| Email 6-digit code login (no magic links, no passwords) | Instagram's in-app browser breaks magic links. Codes are generated with Supabase Auth's admin `generateLink` and delivered by our own notification service (Resend), so we control the template and demo mode can show them. |
| `APP_ENV=production` forces demo mode off whatever `DEMO_MODE` says | The real app can never show login codes on screen or seed/reset demo data by mistake. |
| Real app without an email key refuses sign-in with a clear message; login codes aren't stored in the Outbox once email is live | Never claim a code was sent; nobody reading the log can sign in as a client. |
| Demo mode shows client codes on screen, never admin codes | So the preview can be clicked through without email. Admins enter `DEMO_ADMIN_CODE` instead; otherwise anyone could open the admin on a public preview. |
| Booking engine in Postgres functions (`book_session`, `cancel_booking`, `process_waitlist`, …) that `SELECT … FOR UPDATE` the class row | Guarantees no double-booking of the last reformer under concurrency (tested with 6 parallel requests → exactly 3 succeed). |
| Server is the only writer (service role); engine functions executable only by `service_role`; RLS lets clients read only their own rows | Defence in depth if the public anon key is used directly. Health notes: client reads own, instructor reads all, writes server-side so consent is logged. |
| Health note in a separate table with separate explicit consent | GDPR art. 9 special-category data. |
| Waitlist offer reserves the spot (`spots_taken` counts live offers) | The offered person can't be beaten to it while they decide. |
| Payment layer behind `PaymentProvider` (Stripe Checkout today, mock without keys, Viva.com stub) | Viva Wallet is common in Cyprus; Stripe-hosted checkout means no card data touches us. |
| Notification service writes every message to `notifications` (the admin Outbox) and only sends when the provider is configured and demo mode is off | Demo-safe; doubles as a message log. Transactional only; marketing must never go through it. |
| Reminders and waitlist advancing run in `runTick()`, called every 5 minutes by Supabase **pg_cron + pg_net** → `GET /api/cron/tick` (Bearer `CRON_SECRET`). `scripts/migrate.mjs` (re)creates the job `reform-tick` on every production deploy from `NEXT_PUBLIC_SITE_URL` + `CRON_SECRET`. Page views also tick (max once a minute) as a fallback. Heartbeat `studio_settings.last_cron_tick_at`; admin warns after 20 min | Vercel Hobby cron is daily only; pg_cron is free and inside the database. |
| Next.js 16 with `cacheComponents` off | Almost every page is per-user and dynamic; the previous caching model is simpler and fully supported. |
| Map is click-to-load; only essential cookies | ePrivacy: no cookie banner needed, and nothing third-party loads before consent. |
| Demo data is a SQL function (`seed_demo`) relative to `now()`, with admin "Reset demo data" (demo mode only) | The demo always looks current and can be replayed. |
| Login cookies httpOnly | Hardening; we don't use the Supabase browser client. |
| Append-only credit ledger (typed entries: grant, booking_debit, cancel_refund, expiry, admin_adjustment, rollover, freeze_extension) with a trigger blocking UPDATE/DELETE; `credit_lots.remaining` is a cache kept in lock-step by SQL functions only (test checks the invariant) | Single source of truth for her accountant and disputes; never edit a balance. |
| Package validity computed in SQL (`compute_expiry`, `recalc_lot_expiry`, `lot_usable_for`) | Provisional expiry must move when the first class is cancelled, and closures must extend it consistently. |
| Pay in advance + Mark as paid (offline payments) using the same payments/ledger as Stripe | She isn't registered yet; switching online on later needs only the flag and live keys. |
| Student price computed server-side (`src/lib/pricing.ts`) | Clients can't send their own price. |
| `where true` on bulk deletes in `reset_demo_data` | Supabase's safeupdate rejects unqualified DELETE/UPDATE via the API. |
| Never edit an applied migration; replace functions in a new one (e.g. `seed_demo` v2 in `20261024000200`) | `scripts/migrate.mjs` runs each file once on the live database; edits to old files never reach it. |
| Weekly repeat bookings in TypeScript (`src/lib/recurring.ts`) on top of `book_session` | Reuses every engine rule (capacity lock, validity, window) and the notification service; no second booking path. |
| A trigger cancels the pending payment when an unpaid trial/drop-in booking is released (cancelled in time, studio-cancelled, expired); late cancels and no-shows keep it for her to decide (Remove button) | Otherwise it lingers in "Awaiting payment", blocks the trial, and Mark as paid would re-confirm a cancelled booking. |
| Forms submit through `keepValues()` (`src/lib/keep-form.ts`) instead of `<form action>` | React 19 resets `<form action>` forms after every submit, wiping what people typed when there's a validation error. |
| Demo reset keeps products, photos and settings | Her edited prices survive "Reset demo data". |
| Navigation: wordmark is not a link, no header account icon, Back buttons go one step back (`BackButton`) | Her notes: the bottom bar already has Account; clients arrive deep-linked from Instagram. |

## Tech
- **Stack:** Next.js 16 (App Router, `src/`, `proxy.ts` instead of middleware), TypeScript, Tailwind v4, Supabase (Postgres + Auth), Stripe, Resend, Twilio, Playwright.
- **Key files:**
  - `supabase/migrations/*`: schema, engine, RLS, demo seed, hardening. Never change the DB manually; add a migration. `supabase/setup.sql` is a generated bundle (`npm run db:bundle`).
  - `src/lib/booking.ts`: server orchestration (book, trial/drop-in, pay, cancel, waitlist, reminders) and notifications.
  - `src/lib/packages.ts` (package cards and progress), `src/lib/recurring.ts` (weekly bookings), `src/lib/media.ts` (her photos), `src/lib/profile.ts` (profile and health saving).
  - `docs/feedback/*`: her notes rewritten as build briefs, with open questions.
  - `src/lib/auth.ts`: `getViewer`, `requireAdmin`, `getSettings`.
  - `src/lib/payments/*`, `src/lib/notifications/*`: swappable providers.
  - `src/lib/time.ts`: all timezone formatting (UTC stored, Nicosia shown).
  - `src/app/(client)/*`: client app.
  - `src/app/admin/*`: admin. Every server action calls `requireAdmin()` through `admin()` and writes `audit_log`.

## Deployment
Two apps from the same branch (details in `docs/launch/2-production.md`):
- **Real studio app (production):** https://reform-studio-pink.vercel.app, Vercel project `reform-studio`, Supabase **reform-prod** (Frankfurt, free). `APP_ENV=production`, `DEMO_MODE=false`. Needs `RESEND_API_KEY` + `EMAIL_FROM` before anyone can sign in. Only the baseline (settings, class types, packages) is seeded; never reset.
- **Demo / staging:** the live demo below.

### Demo / staging
- **URL:** https://reform-pilates-seven.vercel.app (Vercel project `reform-pilates`, account petridesart-cloud).
- **Database:** Supabase **reform-db**, free plan, Frankfurt, created through the Vercel Marketplace. Its env vars are injected automatically.
- **App env vars set in Vercel:** `DEMO_MODE=true`, `ADMIN_EMAILS`, `DEMO_ADMIN_CODE`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- **Deploys:** automatic on every push to `claude/pilates-booking-app-sk3trx` (the GitHub repo is connected to Vercel). `vercel deploy --prod` also works.
- **Lighthouse (mobile, production build):** Accessibility, Best Practices and SEO 100 on all audited pages; Performance 90–99. Keep entrance animations transform-only, keep loading skeletons full height (CLS), and don't preload accent fonts.
- **Migrations run on deploy:** the `vercel-build` script runs `scripts/migrate.mjs` (tracked in `_app_migrations`), and a fresh demo database is seeded. The dev sandbox can't reach the database directly; Vercel can.
- **Login codes:** hosted Supabase sends 8-digit codes, so the app accepts 6–10 digits.
- **Cloud session:** Node CLIs need `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

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
- **Live admins:** petridesart@gmail.com and elysia.stephani@gmail.com (`ADMIN_EMAILS` in Vercel); more can be added in Admin → Settings → Studio team.
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
- **Done:**
  - Client app with her real policy, pay-in-advance package requests, receipts and Packages with terms acceptance.
  - Her round-1 client notes (`docs/feedback/elysia-client-notes-1.md`): her logo, real prices, cash/Revolut choice, trials and drop-ins, weekly repeat bookings, 3-state colours, new My classes with package progress, new Account, Studio / Events / Rules pages, Back buttons, Photos manager.
  - Admin: Today (awaiting payment with chosen method, roster flags), classes, timetable, closures, clients (profile, health behind a tap, student verification, holiday return, ledger), Outbox, stats, import, settings (price grid, booking window, studio sections), photos, compliance.
  - PWA manifest and icons, Open Graph previews.
  - 33 engine tests + 6 Playwright flows green on a production build.
- **Waiting on the owner (questions in the brief):**
  - Answers to the open questions in `docs/feedback/elysia-client-notes-1.md` (euro and DOB required are answered; defaults are live for the rest).
  - Her Revolut link, IBAN, original logo file and photos (she can upload them herself now).
  - Address, her full name, contact details.
- **Proposed v2:**
  - Wallet passes, auto-renewing memberships (code exists, flagged off), corporate accounts, referrals, gift vouchers.
  - PAR-Q questionnaire, private feedback, demand insights, Greek/Russian, motion system with sheets/gestures.
  - Stop repeat trials from new email addresses (phone match), photo captions/reordering.
