# Re·Form Pilates booking app: architecture

A map of the system as it is on the `hardening-pass` branch (5 Nov 2026). For the studio's business rules and
the history of decisions, see `CLAUDE.md` and `docs/feedback/*`.

## 1. Stack and deployments

| Layer | What |
|---|---|
| Web app | Next.js 16.4 (App Router, `src/`, React 19.3, Server Components + Server Actions, `src/proxy.ts` instead of middleware), TypeScript, Tailwind v4 |
| Database / auth | Supabase: Postgres 17, Supabase Auth (email + password, email OTP via admin `generateLink`), Storage bucket `media` (public) |
| Email | Resend (EU region, domain `mail.reformpilatescy.com`) |
| SMS | Twilio (optional; off: `waitlist_sms` false, no keys in production) |
| Payments | `PaymentProvider` interface: Stripe Checkout (`src/lib/payments/stripe.ts`), mock checkout without keys, Viva stub. **Online payments are off**; offline "Mark as paid" is the live flow |
| Scheduler | Supabase `pg_cron` + `pg_net` call `GET /api/cron/tick` every 5 min (Bearer `CRON_SECRET`); page views also tick at most once a minute (`src/lib/tick.ts`) |
| Hosting | Vercel, two projects from one Git branch (`claude/pilates-booking-app-sk3trx`): `reform-studio` (real app, `book.reformpilatescy.com`, `APP_ENV=production`) and `reform-pilates` (demo, `DEMO_MODE=true`). Each has its own Supabase project (prod `reform-prod`, demo `reform-db`, both Frankfurt) |
| Build | `vercel-build` = `node scripts/migrate.mjs && next build`. `migrate.mjs` applies `supabase/migrations/*.sql` once each (table `_app_migrations`), each in a transaction with `app.env` set; seeds demo data on a fresh demo DB; (re)creates the pg_cron job on production; skips on non-production Vercel deployments |
| Tests | `tests/engine.test.ts` (54 node:test cases against local Supabase), `tests/webhook.test.ts` (3, Stripe signature/idempotency), `e2e/*.spec.ts` (11 Playwright flows) |

There is **no service worker**: the PWA is a web manifest (`src/app/manifest.ts`) and icons only, so there's no cached app shell.

## 2. Directory map

- `src/app/(client)/*`: the client app (Home, Schedule, class page `/book/[id]`, Packages `/packs`, My classes `/bookings`, Account, Events, Studio, policies, legal, sign-in/up, health questions).
- `src/app/admin/*`: the studio side (Today, Classes, Clients, Stats, Settings and their sub-pages). `src/app/admin/actions.ts` holds 47 server actions; each starts with `admin()` → `requireAdmin()` + an `audit_log` row.
- `src/app/api/*`: route handlers (see §4).
- `src/lib/*`: server logic. Key modules:
  - `booking.ts`: book, cancel, waitlist, payments, tick.
  - `auth.ts` / `auth-flow.ts`: viewer, admin, sign-in helpers.
  - `notifications/*`: templates, email, SMS, outbox.
  - `payments/*`.
  - `recurring.ts`: weekly bookings.
  - `packages.ts` / `client-history.ts`: package views.
  - `rewards.ts` / `discount.ts`: codes.
  - `kinds.ts` / `kind-label.ts`: class-type labels and tabs.
  - `studio-alerts.ts`: emails to the studio.
  - `rate-limit.ts`.
  - `time.ts`: all timezone formatting, Europe/Nicosia.
  - `terms.tsx`: editable Terms.
  - `policy.ts` / `content.ts`: her editable texts.
  - `pricing.ts`.
  - `safe-next.ts`: redirect sanitiser.
  - `env.ts`: config and flags.
- `src/components/*`: shared UI.
- `supabase/migrations/*`: 34 migration files; the schema, the booking engine (PL/pgSQL), RLS, triggers, demo seed. `supabase/setup.sql` is a generated bundle; `supabase/seed.sql` calls `seed_demo()`.
- `scripts/migrate.mjs`, `scripts/widen-types.mjs`.
- `docs/feedback/*` (her notes as briefs), `docs/guides/*` (studio + client PDFs), `docs/launch/*`.

## 3. Data model (Postgres, schema `public`)

RLS is **enabled on every table**. The server uses the service-role key (bypasses RLS) for all reads and writes; the
browser never gets a Supabase client or token (cookies are httpOnly). RLS is defence in depth for the public
anon key + a user's JWT.

| Table | Holds | RLS policies (anon/authenticated) |
|---|---|---|
| `profiles` | Client/admin people: names, email, phone, DOB, emergency contact (+relation), goal, photo consent, role (`client`/`admin`), student-verified-until, marketing/reminder flags, `parq_completed_at`, `onboarded_at`, `admin_notes`, `deleted_at`, `user_id` → auth.users | own read; own update; admin all |
| `health_notes` | Special-category health answers (conditions, details, pregnancy, meds, clearance flags, consent time) | owner or instructor read; no client writes (server only, A-086) |
| `health_history` | A copy of every health save | none (server only) |
| `consents` | Versioned consent records (policy, terms, fitness_declaration, health_data, marketing_email/sms, photos) | own read |
| `class_types` | Reformer, Mat, Event, Pre & Post Natal, Private… (kind, credit_kind, capacity, minutes, credit_cost, private, archived_at) | public read (active) |
| `class_sessions` | Scheduled classes/events (time, capacity, price, title, location, status, template, clients_only, what_to_bring, event_policy, recap, signup_question, title_font) | read through `can_see_session()`: clients-only events only for those who may see them, private sessions only for the studio and the client booked in (A-041) |
| `timetable_templates`, `template_slots` | Repeating weekly timetable | admin read; written by the server only (A-086) |
| `bookings` | Session × profile (status held/confirmed/cancelled/late_cancelled/studio_cancelled/expired/no_show, source, paid_with, payment_id, checked_in_at, answer, note, late_refund_pending, free_cancel_until) | own read |
| `waitlist_entries` | Position by created_at; waiting/offered/claimed/expired/left | own read |
| `products` | Packages, trials, drop-ins, memberships (tag, credit_kind, credits, months, validity_days, price, is_group, active, archived_at) | public read (active) |
| `payments` | Offline + Stripe payments (status, method, intended_method, amount, purpose, product, booking, discount_code_id, discount_note) | own read |
| `credit_lots` | A package's classes (total, remaining cache, started_at, expires_at, validity_days, payment) | own read |
| `credit_ledger` | **Append-only** typed ledger (grant, booking_debit, cancel_refund, expiry, admin_adjustment, rollover, freeze_extension); trigger blocks UPDATE/DELETE | own read |
| `lot_freezes` | Freeze From–To per lot | none |
| `memberships` | Monthly subscriptions (flagged off) | own read |
| `recurring_rules` | Client's weekly slots | own read |
| `discount_codes` | Codes and personal rewards (kind, value, applies_to, profile, expiry, max_uses) | none |
| `credit_kinds`, `package_tabs` | What packages are "for", and the Packages page tabs | public read |
| `event_access` | People allowed into clients-only events | none |
| `closures` | Studio closures / holiday suggestions | public read (confirmed) |
| `notifications` | Outbox: every email/SMS (dedupe_key unique, status) | admin read |
| `media` | Her photos (slot → Storage path) | public read |
| `site_content` | Her editable texts (rules, policy, terms…) | public read |
| `studio_settings` | One row of settings / feature flags (§8) | public columns only (name, intro, banner, contact, Instagram, map, cutoff, window…), also as the `studio_public` view; no alert email, bank details, heartbeats or retention (A-041) |
| `compliance_items` | "Before online payments" checklist | admin all |
| `audit_log` | Every admin action | admin read |
| `otp_requests`, `rate_events` | Rate-limit records (hashed keys) | none |
| `processed_webhooks` | Stripe event idempotency | none |

**Enums:**
- `user_role`, `class_kind` (reformer, mat, event, other).
- `credit_kind`: reformer, mat, prenatal_*, private_*, and runtime values from `add_credit_kind`.
- `session_status`, `booking_status`, `booking_source` (online/manual), `paid_with`, `waitlist_status`, `payment_status`, `product_kind`, `notification_channel`/`status`, `consent_type`, `membership_status`, `ledger_entry`.

**Engine functions (SECURITY DEFINER, execute granted to `service_role` only unless noted):**
- **Booking:**
  - `book_session` locks the class row `FOR UPDATE`, then checks status, window, capacity (`spots_taken` counts confirmed + held + live offers), credits (`spend_credits`, oldest-expiring first via `lot_usable_for`), trial eligibility (`trial_eligible`, by account + last 8 phone digits), unpaid limit and pay-later.
  - `cancel_booking` applies the cutoff and refunds to the same lot; it honours `free_cancel_until` (unused) and `late_refund_pending`.
  - `cancel_session` (studio cancels; credits back).
- **Waitlist:** `join_waitlist`, `leave_waitlist`, `process_waitlist` (auto-book with a package class more than `waitlist_close_minutes` before class, else a held offer), `tick` (expires offers/holds, then advances).
- **Credits:** `grant_lot`, `return_credit`, `admin_adjust_lot` (extend/freeze/end/add/remove, all ledger entries), `admin_adjust_credits`, `expire_credits`, `compute_expiry`, `recalc_lot_expiry`, `usable_credits`, `credit_balance`.
- **Payments:** `confirm_payment` (offline/Stripe → grant or confirm booking; idempotent `already_paid`), `expire_unpaid_requests`, `release_unpaid_payment` (trigger).
- **Timetable and closures:** `generate_sessions[_range]`, `extend_timetable` (≥ booking window + 14 days), `replace_timetable_from`, `apply_closure`, `closed_days`, `is_closed_on`.
- **Access:** `is_admin`, `my_profile_id` (used by RLS, executable by anon too), `is_studio_client`, `can_access_event`, `can_see_session` (the `class_sessions` policy). Anon/authenticated hold no TRUNCATE/TRIGGER/REFERENCES (also as default privileges), and `credit_ledger` refuses TRUNCATE (A-086).
- **Guard triggers:**
  - `guard_clients_only`.
  - `guard_free_booking`.
  - `guard_private_booking`.
  - `guard_closed_booking`.
  - `ledger_append_only`.
  - `tidy_package_names`.
  - `handle_new_user` (on auth.users insert).
- **Other:** `erase_profile` (GDPR erasure), `rate_limited`, `stats_months`, `session_availability`, `add_credit_kind`, `auth_user_by_email`, `seed_demo*` / `reset_demo_data` (demo only).

## 4. Routes

### Client pages (`src/app/(client)`)
| Path | Purpose | Auth |
|---|---|---|
| `/` | Home: greeting, intro, Secure your package, next class, pills, upcoming event, Next available | public (personalised when signed in) |
| `/schedule` | Day strip + classes (private sessions hidden) | public |
| `/book/[id]` | Class/event page: book with a class, trial/drop-in (cash/Revolut), free event, waitlist, code | public view; actions need onboarded + DOB + health |
| `/packs` | Packages tabs (hidden tabs admin-only), request a package, code | public view; request needs sign-in |
| `/bookings` | My classes: packages, awaiting payment, waitlist, upcoming (cancel) | signed in |
| `/bookings/package/[id]` | One package's classes + Every week link | owner |
| `/bookings/weekly` | Same days every week | onboarded |
| `/bookings/[id]/confirmed` | Confirmation | owner |
| `/account` | Details, health, notifications, receipts, privacy (export/delete) | signed in |
| `/receipts/[id]` | Payment confirmation (not an invoice) | owner or admin |
| `/membership` | Monthly package (flagged off) | signed in |
| `/events`, `/studio`, `/magic`, `/contact` | Content pages | public |
| `/policy`, `/policy/payments`, `/legal/[slug]` (terms, privacy, health, cookies… ; `cancellation` → `/policy/payments`) | Policies | public |
| `/login`, `/signup`, `/welcome`, `/health` | Sign-in, create account, details for older accounts, health questions | public / signed in |
| `/checkout/mock` | Mock checkout without Stripe keys | signed in |

### Admin pages (`src/app/admin`, layout requires admin)
- `/admin`: Today.
- `/admin/classes` (+`/new`, `/[id]`), `/admin/timetable`, `/admin/closures`.
- `/admin/clients` (+`/[id]`, `/codes`).
- `/admin/stats`.
- `/admin/settings`, `/admin/texts`, `/admin/photos`, `/admin/team`, `/admin/outbox`, `/admin/import`, `/admin/compliance`.
- `/admin/export/payments` (CSV route).

### API routes
| Route | Method | Auth | Does |
|---|---|---|---|
| `/api/cron/tick` | GET | `Authorization: Bearer CRON_SECRET` | `runTick("cron")`: offers, reminders, expiries, timetable top-up, weekly bookings |
| `/api/stripe/webhook` | POST | Stripe signature (`STRIPE_WEBHOOK_SECRET`), idempotent via `processed_webhooks` | `onPaymentPaid`, membership renewals, expiries |
| `/api/stripe/portal` | POST/GET | signed in | Stripe billing portal (memberships; off) |
| `/api/account/export` | GET | signed in | GDPR export of the viewer's data as JSON |
| `/api/ics/[id]` | GET | booking owner | Calendar file |
| `/admin/export/payments` | GET | admin | Payments CSV |
| `/pwa-icon/[size]`, `opengraph-image`, `manifest.webmanifest` | GET | public | Icons and previews |

### Server actions (all `"use server"`)
- **Client:**
  - `login/actions.ts`: signIn, confirmEmail, resendCode, requestReset, resetPassword, signUp, signOut.
  - `welcome/actions.ts`, `health/actions.ts`, `account/actions.ts` (saveProfile, signOut, deleteAccount).
  - `book/[id]/actions.ts`: bookAction, checkSingleCodeAction, join/leave waitlist.
  - `bookings/actions.ts` (cancel), `bookings/weekly/actions.ts`, `packs/actions.ts` (buyPackAction, checkCodeAction), `membership/actions.ts`, `checkout/mock/actions.ts`.
- **Admin:**
  - `admin/actions.ts`: 47 actions, each via `admin()`.
  - `admin/photos/actions.ts`.

## 5. Auth flow
1. **Create account** (`/signup`):
   - Zod-validated details (18+ DOB) and password.
   - `admin.createUser({ email_confirm: false, user_metadata })`. A confirmed email can't be re-registered.
   - A 6-digit code comes from `admin.generateLink({type:'magiclink'})` and is sent by our notification service. Demo mode shows it on screen for non-admins.
2. **Confirm:** `verifyOtp({type:'email'})` signs the user in (httpOnly cookies set by `@supabase/ssr`). Then `onboard()` writes the profile + consents (`policy`, `terms`, `fitness_declaration`, `photos`, `marketing_email`), and the user goes to `/health`.
3. **Sign in** (`/login`): `signInWithPassword`. Rate limits: 10/email and 50/IP per 15 min; code requests 5/email and 20/IP per 15 min; code attempts 10/email and 50/IP.
   - **Demo:** admins use `DEMO_ADMIN_CODE` as the password, and `@example.com` demo clients use `reform-demo`.
4. **Forgot password:** code by email → `verifyOtp` → `admin.updateUserById(password)` → `signInWithPassword` again.
5. **Session refresh:** `src/proxy.ts` refreshes the session on every non-static request. `getViewer()` = `auth.getUser()` + `ensureProfile` (links an existing profile by email).
6. **Admin:** `profiles.role = 'admin'`, bootstrapped from `ADMIN_EMAILS` on first sign-in (`profileFor`) and managed in Settings → Studio team. `requireAdmin()` guards admin pages and actions. The admin layout also checks.
7. **Redirects:** every `next` passes through `safeNext()`.

## 6. Booking, credit and waitlist flows
- **Book with a package class:** `bookAction("credit")` → `book_session(p_mode='credit')` locks the class, checks capacity, `spend_credits` debits the oldest usable lot (ledger `booking_debit`), and `recalc_lot_expiry` sets the provisional expiry from the first class. A confirmation email is sent, plus a studio alert.
- **Trial / drop-in / paid event:** `bookSingle` → `book_session(p_mode='trial'|'drop_in', p_method)` creates a confirmed booking + pending offline payment (one unpaid at a time). An optional code or reward lowers the payment. She taps **Mark as paid** (`markPaid` → `onPaymentPaid` → `confirm_payment`).
- **Free event:** `bookFree` (`p_mode='free'`, guarded by `guard_free_booking`).
- **Package request:** `buyPackAction` → `buyProduct` creates a pending offline payment (expires after `unpaid_request_expiry_hours`, 48), with student price, code or reward handled server-side (`packagePrice`). **Mark as paid** → `confirm_payment` grants a lot (ledger `grant`), adds free reward classes (`admin_adjust_lot add`), then `applyRecurring`.
- **Cancel:** `cancelBooking` → `cancel_booking`:
  - 6h or more before class: the credit goes back to the same lot (`cancel_refund`).
  - Later: `late_cancelled`, credit forfeited (optionally refunded if re-filled: `apply_late_fill_refund`).
  - Events: clients can't cancel.
  - Then `process_waitlist`.
- **Studio cancels:** `cancel_session` returns credits and emails clients. Pending unpaid payments are cancelled by trigger.
- **Waitlist:** `join_waitlist` (clients-only/private guards) → when a spot opens, `process_waitlist`:
  - More than `waitlist_close_minutes` (60) before class: auto-book the first in line who has a usable class, otherwise a held offer that reserves the spot until the close.
  - Within the close: nobody is moved in.
  - `tick` expires offers and holds.
- **Weekly:** `recurring_rules` + `applyRecurring()` (on save, Mark as paid, timetable save and every tick) books matching classes inside the window via `book_session`. If a class is full, the client gets a waitlist email.
- **Freezes and closures:** `lot_freezes` block bookings inside the dates (`package_frozen`). `apply_closure` cancels classes and extends started lots (`freeze_extension`).
- **Validity:** 30/60 days from the first class (`compute_expiry`), recalculated when the first class moves, and locked once it has passed. `expire_credits` writes `expiry` entries.

## 7. Notifications
- `notify(to, template, data, opts)` (`src/lib/notifications/index.ts`):
  - Renders `templates.ts`; data is HTML-escaped.
  - Inserts into `notifications` with a unique `dedupe_key` (a duplicate means it was already sent).
  - Sends via Resend/Twilio only when live (`emailLive()`: key present and not demo).
  - Login codes are never stored once email is live.
  - Reply-To is `EMAIL_REPLY_TO`, else the contact email.
- **Client templates:** booking_confirmed, cancellation_confirmed, waitlist_offer/booked, reminder_24h/2h, payment_request, credits_added, credit expiry/low notices, weekly_booked/full, verify_email, reset_code, birthday, reward.
- **Studio alerts:** `studio_alert` (`src/lib/studio-alerts.ts`) to `alert_email`, else the contact email, else the first admin. Switchable per kind; never health content.
- **Reminders:** sent in `runTick` for each `reminder_offsets_minutes` offset (dedupe key `reminder:{offset}:{booking}`), skipped when the client turned reminders off or booked after the reminder time.

## 8. Feature flags and settings (`studio_settings`, one row, editable in Admin → Settings)
`timezone`, `currency`, booking window (`booking_window_days`), `cancellation_cutoff_hours` (6), `refund_late_cancel_if_filled`,
`waitlist_close_minutes` (60), `waitlist_window_minutes`, `waitlist_sms` (false), `reminder_offsets_minutes`,
`expiry_reminder_days`, `unpaid_request_expiry_hours` (48), `allow_pay_later` (false), `online_payments_enabled` (false; locked until
the compliance checklist is complete outside demo mode), `student_discount_pct` (10), `vat_registered`/`vat_rate`/`vat_number` (hidden),
business identity (`legal_name`, `trader_name`, address, contact email/phone, instagram), payment instructions (`revolut_link`,
`bank_iban`, `bank_account_name`), `status_banner`, `intro_line`, `policy_version`, `membership_period_mode`, `rollover_max`,
studio alerts (`alert_email`, `alert_*`), heartbeats (`last_tick_at`, `last_cron_tick_at`).

Environment flags (`src/lib/env.ts`): `APP_ENV=production` (real app; forces demo off), `DEMO_MODE`, `DEMO_ADMIN_CODE`,
`ADMIN_EMAILS`, payments live iff `STRIPE_SECRET_KEY`, email live iff `RESEND_API_KEY` and not demo, SMS live iff Twilio vars and not demo.

## 9. Third parties and data location
| Service | Used for | Data | Region |
|---|---|---|---|
| Vercel | Hosting, serverless functions, logs | All request data in transit; function logs | Functions region per project (to verify: should be `fra1`); edge network global |
| Supabase | Postgres, Auth, Storage | Everything stored | Frankfurt (eu-central-1) |
| Resend | Transactional email | Email address, name, message content | EU region domain |
| Twilio | SMS (off) | Phone, message | US (not in use) |
| Stripe | Card payments (off, test only) | Email, payment | EU/US |
| Google Fonts | Fonts | Self-hosted at build by `next/font`: no runtime request to Google | n/a |
| Google Maps | Click-to-load map on Contact | Only after the visitor taps | US |
| Cloudflare | DNS for the domain | None | n/a |

## 10. Environment variables
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`POSTGRES_URL_NON_POOLING` / `DATABASE_URL` (migrations), `APP_ENV`, `DEMO_MODE`, `DEMO_ADMIN_CODE`, `ADMIN_EMAILS`,
`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`; Vercel-provided `VERCEL_URL`, `VERCEL_ENV`.

## 11. Security model in one paragraph
- **Server-side only:** all reads and writes happen on the server with the service role. Clients never hold a Supabase client, and the session cookies are httpOnly.
- **Authorization in the app:** every user action re-derives the viewer from the session cookie (`getViewer`). Ownership is checked in the action or in the SQL function (`p_profile` must own the booking). Admin actions go through `admin()`.
- **Booking rules in the database:** the engine functions lock rows and enforce every rule, so the UI can't bypass them. RLS + revoked function grants protect the database if the anon key is used directly.
- **Health data:** stored only in `health_notes`/`health_history`, shown only to admins, never emailed.
- **Rate limiting:** in SQL for auth, codes and booking-type actions.
- **Headers:** security headers in `next.config.ts` (HSTS, nosniff, frame DENY, referrer, permissions). A Content-Security-Policy in **Report-Only** mode comes from `src/proxy.ts` with a fresh nonce per request (`src/lib/csp.ts`: own origin, nonce + `strict-dynamic` scripts, Supabase images, the Google map frame, `form-action 'self'` + Stripe Checkout); violations are logged by `/api/csp-report`. `e2e/authz.spec.ts` checks pages have none. To enforce it later, change `CSP_HEADER` and add `frame-ancestors 'none'`.

## 12. Function index: where each SQL function is currently defined (A-069)

Migrations are never edited, so a function's body lives in the *latest* migration that replaces it. Check here before
changing one, and replace it in a new file. (Generated from `supabase/migrations/*.sql`; `admin_adjust_credits` was dropped in `20261106000907`.
Functions created inside other statements or helper `pg_temp` functions are not listed.)

| Function | Latest definition |
|---|---|
| `active_client_ids` | `20261106000906_wp9_perf_rpcs.sql` |
| `add_credit_kind` | `20261103000200_round6.sql` |
| `add_local_days` | `20261106000905_wp12_time_fixes.sql` |
| `admin_adjust_lot` | `20261106000905_wp12_time_fixes.sql` |
| `apply_closure` | `20261106000905_wp12_time_fixes.sql` |
| `apply_late_fill_refund` | `20261106000401_wp3_late_fill.sql` |
| `auth_user_by_email` | `20261025001900_round4.sql` |
| `book_session` | `20261106000400_wp3_booking_waitlist.sql` |
| `can_access_event` | `20261025001600_review_fixes.sql` |
| `can_see_session` | `20261106000904_wp11_rls_grants.sql` |
| `can_view_health` | `20261106000300_wp2_health_consent.sql` |
| `cancel_booking` | `20261106000907_wp13_cleanup.sql` |
| `cancel_session` | `20261106000900_answers_studio_cancel_late.sql` |
| `cancel_sessions` | `20261106000402_wp3_payments_closures.sql` |
| `clear_health_data` | `20261106000300_wp2_health_consent.sql` |
| `closed_days` | `20261011000800_studio_policy.sql` |
| `compute_expiry` | `20261011000800_studio_policy.sql` |
| `confirm_closure` | `20261106000402_wp3_payments_closures.sql` |
| `confirm_payment` | `20261106000402_wp3_payments_closures.sql` |
| `credit_balance` | `20261011000800_studio_policy.sql` |
| `credit_ledger_no_truncate` | `20261106000904_wp11_rls_grants.sql` |
| `due_reminders` | `20261106000600_wp5_tick.sql` |
| `enforce_retention` | `20261106000800_wp7_privacy_lifecycle.sql` |
| `erase_profile` | `20261106000800_wp7_privacy_lifecycle.sql` |
| `expire_credits` | `20261011000600_payments_memberships.sql` |
| `expire_unpaid_requests` | `20261011000800_studio_policy.sql` |
| `extend_timetable` | `20261103000200_round6.sql` |
| `first_class_at` | `20261106000906_wp9_perf_rpcs.sql` |
| `generate_sessions` | `20261025001600_review_fixes.sql` |
| `generate_sessions_range` | `20261025001600_review_fixes.sql` |
| `grant_lot` | `20261011000800_studio_policy.sql` |
| `grant_membership_period` | `20261011000600_payments_memberships.sql` |
| `guard_clients_only` | `20261025001500_event_access.sql` |
| `guard_closed_booking` | `20261011000800_studio_policy.sql` |
| `guard_code_uses` | `20261106000405_wp3_code_uses.sql` |
| `guard_free_booking` | `20261025001900_round4.sql` |
| `guard_minor_booking` | `20261106000903_wp8_adults_only.sql` |
| `guard_no_show_future` | `20261106000407_wp3_no_show_after_start.sql` |
| `guard_policy_versions` | `20261106000902_wp8_policy_versions.sql` |
| `guard_private_booking` | `20261103000200_round6.sql` |
| `handle_new_user` | `20261106000100_wp1_auth_linking.sql` |
| `handle_user_confirmed` | `20261106000100_wp1_auth_linking.sql` |
| `health_consent_standing` | `20261106000300_wp2_health_consent.sql` |
| `install_baseline` | `20261025000300_production_baseline.sql` |
| `install_catalogue` | `20261024000200_demo_seed_v2.sql` |
| `is_admin` | `20261011000200_functions.sql` |
| `is_closed_on` | `20261011000800_studio_policy.sql` |
| `is_studio_client` | `20261025001500_event_access.sql` |
| `join_waitlist` | `20261106000400_wp3_booking_waitlist.sql` |
| `leave_waitlist` | `20261011000200_functions.sql` |
| `ledger_append_only` | `20261106000800_wp7_privacy_lifecycle.sql` |
| `locked_events` | `20261106000906_wp9_perf_rpcs.sql` |
| `lot_class_range` | `20261011000800_studio_policy.sql` |
| `lot_usable_for` | `20261025001900_round4.sql` |
| `low_credit_groups` | `20261106000600_wp5_tick.sql` |
| `my_profile_id` | `20261011000200_functions.sql` |
| `notification_reclaim` | `20261106000500_wp4_notifications_retry.sql` |
| `notification_retry_claim` | `20261106000500_wp4_notifications_retry.sql` |
| `notification_stale` | `20261106000500_wp4_notifications_retry.sql` |
| `onboard_profile` | `20261106000902_wp8_policy_versions.sql` |
| `pause_membership` | `20261011000600_payments_memberships.sql` |
| `payments_by_method` | `20261106000906_wp9_perf_rpcs.sql` |
| `period_end` | `20261011000600_payments_memberships.sql` |
| `phone_key` | `20261025000800_trial_by_phone.sql` |
| `process_waitlist` | `20261025001900_round4.sql` |
| `profiles_lower_email` | `20261106000100_wp1_auth_linking.sql` |
| `rate_limited` | `20261025000700_rate_limits.sql` |
| `recalc_lot_expiry` | `20261011000800_studio_policy.sql` |
| `record_policy_version` | `20261106000902_wp8_policy_versions.sql` |
| `release_unpaid_payment` | `20261025000100_round1_fixes.sql` |
| `replace_recurring_rules` | `20261106000700_wp6_atomic_writes.sql` |
| `replace_timetable_from` | `20261025001300_admin_round1.sql` |
| `reset_demo_data` | `20261025000100_round1_fixes.sql` |
| `resume_membership` | `20261106000905_wp12_time_fixes.sql` |
| `return_credit` | `20261106000905_wp12_time_fixes.sql` |
| `save_health_answers` | `20261106000300_wp2_health_consent.sql` |
| `save_timetable` | `20261106000700_wp6_atomic_writes.sql` |
| `seed_demo` | `20261106000907_wp13_cleanup.sql` |
| `seed_demo_profiles` | `20261025001400_demo_seed_fix.sql` |
| `session_availability` | `20261106000906_wp9_perf_rpcs.sql` |
| `settings` | `20261011000200_functions.sql` |
| `spend_credits` | `20261025001900_round4.sql` |
| `spots_taken` | `20261011000200_functions.sql` |
| `stats_months` | `20261025001900_round4.sql` |
| `tick` | `20261011000200_functions.sql` |
| `tidy_package_name` | `20261025001700_studio_notes_2.sql` |
| `tidy_package_names` | `20261025001700_studio_notes_2.sql` |
| `trial_eligible` | `20261025000800_trial_by_phone.sql` |
| `update_session` | `20261106000406_wp3_update_session.sql` |
| `usable_credits` | `20261011000800_studio_policy.sql` |
| `withdraw_health_consent` | `20261106000300_wp2_health_consent.sql` |
