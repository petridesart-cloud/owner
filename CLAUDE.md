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
- **Type (her round-5 note: clean and minimal, like the buttons):**
  - Inter everywhere: `.display` headings are Inter uppercase with wide tracking; `font-serif` now means light Inter for big numbers, times and prices (no Cormorant in the UI). The "Re·Form" wordmark is Inter uppercase, spaced.
  - Pinyon Script only for "See you soon" and event titles she sets to calligraphy; page titles ("Your Packages", "The Studio") are plain Inter (her note, 5 Nov).
  - Barlow Condensed for tiny eyebrow labels.
  - Event titles use her chosen font (`class_sessions.title_font`, `src/lib/event-font.ts`): calligraphy (Pinyon), handwritten (Caveat), minimal, simple, elegant (Cormorant), bold (Barlow 700). Accent fonts aren't preloaded.
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
  - Reformer: capacity 3, 50 minutes. Mat: capacity 4 (her answer, 3 Nov; Pre & Post Natal Mat too).
  - Events (SUP Pilates, brunch) are paid individually.
  - Each class type has a credit cost (a private session may cost 2–3).
- **Cancellation:** **6h** cutoff.
  - 6h or more before class: the credit goes back to the same package with its original expiry, and the client can rebook.
  - Inside 6h, or a no-show: the credit is forfeited. The client can still release the spot to the waitlist.
  - Admin toggle (default off): refund the credit if the spot gets re-booked.
- **Packages (her real prices):** "N per week × 1 or 2 months" (Reformer €70/130/180/220 and €120/240/300/410; Mat €50/90/120/150 and €85/150/200/260). Classes = per week × 4 × months; "per week" is a guide, not a cap.
  - **Trial** (Reformer €25, Mat €20): only for someone who has never booked that class type, matched by account **and phone number** (`trial_eligible()`, last 8 digits). **Drop-in** (€35 / €30). Both reserve the spot with an unpaid payment and the client's chosen method (cash/Revolut); she marks it paid. One unpaid class at a time.
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
- **Studio-cancelled classes** are always replaced: the credit comes back (also for someone who had cancelled late, `cancel_session` v2) and the client is invited to rebook. A studio-cancelled **paid event is refunded in full** (her answer, 7 Nov): Today lists it under "Refunds to pay back" with a Refunded button.
- **Studio removes a client (her answer, 7 Nov):** more than 6h before class the class goes back; inside 6h the default is "Remove (late cancel)" with no class back, or "Remove + return class" (`cancel_booking(…, p_return_credit)`).
- **Closures:**
  - Confirmed closures cancel the classes in that range (clients notified and credited) and block booking those days.
  - Started packages are frozen: their expiry extends by the closed days in their window (overlapping closures counted once), recorded as ledger `freeze_extension`.
  - Cyprus public holidays for the next 12 months are preloaded as suggestions she confirms.
  - "Missed class: public holiday" returns a class with a reason.
- **Waitlist (her rule, round 3; round 4 answers):** when a spot opens more than `waitlist_close_minutes` (60) before class, the first in line with a usable package class is booked in automatically and emailed (`waitlist_booked`). There is **no** free-cancel grace (her answer): the usual 6h rule applies (`bookings.free_cancel_until` stays in the schema, unused). Without a usable class (or events) they get a held offer that ends by the close. Inside the last hour nobody is moved in. A freed spot goes to the waitlist in the same transaction (`cancel_booking` v3 runs `process_waitlist` and returns `offers` to notify; every caller sends them), and while someone ahead is waiting, online bookings get `waitlist_first` (newcomers can still join the queue; the studio can add anyone). Joining is refused beyond the booking window. SMS is off for now (`waitlist_sms` false, her answer); the switch stays in Booking rules.
- **Booking window:** clients book up to 4 weeks ahead (`booking_window_days`, Settings); the studio can add anyone beyond it.
- **Same days every week:** clients pick weekly slots (`recurring_rules`); `applyRecurring()` books them while the package lasts, beyond the cancellation cutoff (never a class already inside 6h: her answer, 7 Nov), inside the window, on save, on Mark as paid, on timetable save and on every tick. Full weeks are skipped with a one-tap waitlist email; classes the client cancelled are never re-booked.
- **Package names** read "Reformer · 8 classes · 1 month" everywhere: triggers (`tidy_package_name`) rewrite "N per week" names on products, payment descriptions and package notes; `packages.ts` shows credits.
- **Class types and offers she builds (round 5):** what packages/trials/drop-ins are "for" lives in `credit_kinds` (key = a `credit_kind` enum value, label shown everywhere via `src/lib/kinds.ts`/`kind-label.ts`). `add_credit_kind()` (service role) adds a new enum value + label, so every booking rule works unchanged; new class types get `class_kind` `other` ("spots left"). Settings → Packages & single classes → "+ Add": Package or Single class (Trial/Drop-in, her name, price, description) with "For" = existing types + "+ New class type" (saved inline by `createClassType`). Class types: Paid with (any kind, or its own packages for a new one), edit, Active, Delete. Delete = archive (`archived_at`) when used by payments/classes, refused with classes still to come; template slots and weekly rules for it are removed; an unused own kind's label row is deleted. Clients' Packages page shows one tab per kind with something on sale. `npm run db:types` widens `credit_kind` (`scripts/widen-types.mjs`).
- **Packages page tabs (round 6, `package_tabs`):** clients pick a tab (Mat, Reformer, Pre and Post Natal, Private) and everything for its class types is inside (`credit_kinds.tab`, `sub_label`, `description`; several types per tab get headings). `visible=false` tabs are set up but hidden (admins see them marked "· hidden"; `buyProduct` refuses requests from them). Settings → Packages page edits tabs. `add_credit_kind()` also creates a tab. `/packs?type=` takes a tab or a credit kind.
- **Private sessions (round 6):** `class_types.private` → never on the schedule (`availability()` filters them unless `includePrivate`), online bookings and waitlist refused (`guard_private_booking`, `private_class`); she adds clients by hand with their private package classes. Her Pre & Post Natal (Mat/Reformer) and Private (Mat, Reformer, Pre & Post Natal Mat, Pre & Post Natal Reformer) types, kinds and packages are seeded by `20261103000200_round6.sql`, hidden until she shows the tabs.
- **Her packages (round 6):** Mat and Reformer 4/8/12 classes × 1 or 2 months (her 3 Nov list); older 16+ class packages archived. Her weekly timetable (32 classes) is loaded only on the real app: `scripts/migrate.mjs` sets `app.env` = production for each migration, and the round-6 migration checks it. Classes are created at least `booking_window_days + 14` ahead (`extend_timetable`); the window is 1–26 weeks in Settings.
- **Studio emails (round 5, `src/lib/studio-alerts.ts`):** emails to `alert_email` (else the contact email, else the first admin) for client bookings (first booking in an empty class says so; weekly batches are one email), sign-ups, cancellations, package requests, details/health-answer updates (names of fields only, never health content). Switches in Settings → Studio emails. Studio-made changes don't email.
- **Home** no longer has the "Book your classes" box; the Studio page has no button. Round 4: Studio · Events · Rules & policies are lavender pills (no photos; photos belong to those pages). "Book the same days every week" lives inside each current package's page (`/bookings/weekly?type=&from=`, only that kind's rules are replaced). A Reformer package can't book Mat (the class page says so).
- **Emergency contact** has an optional relation (`profiles.emergency_contact_relation`).
- **Her photos:** Admin → Settings → Photos uploads to the public Storage bucket `media` (table `media`, slots `logo`, `instructor`, `studio:space` (the Studio page shows every `studio:*` slot), `event:<id>` (archive), `event-cover:<id>` (one background picture, set on the event's admin page)), resized in the browser to ≤1600px.
- **Events (her round-2 notes):** per event she sets title, date, location, description, price, spots, plus `clients_only`, `what_to_bring` (empty = hidden), `event_policy` (shown and emailed instead of the studio policy) and `recap` (archive text). Clients-only (her answer): `is_studio_client()` = an active package (credit lot with classes left, not expired; trials/drop-ins don't count); `can_access_event()` also allows people she adds per event (`event_access`, event admin page) and anyone already booked. Others get a blurred "Clients only" card with no details (Events page, direct link, Schedule row "Special event"), and the trigger `guard_clients_only` refuses their online bookings/waitlist joins; manual adds by the studio are allowed. Events can't be cancelled by clients (`cancel_booking` raises `event_no_cancel` unless admin; `EVENT_POLICY` is the default terms). Previous events show every past event that wasn't cancelled (her note, 5 Nov); photos and the recap are optional extras. Optional Events intro (`site_content.events_intro`) and Studio text: saved empty = hidden.
- **Adults only:** the trigger `bookings_adults_only` refuses any booking for someone under 18 on the class day (`minor_not_allowed`); the studio ticks "18 or over" when adding someone new or importing clients.
- **Client profile:** first name, surname, **date of birth (required, 18 or over only: her answer, round 4; older clients are asked before their next booking)**, optional goal, emergency contact, photo consent (with face / without face / none, logged in `consents` as `photos`).
- **Sign-in (round 4, `src/lib/auth-flow.ts`, `login/actions.ts`):** email + password. Create account (`/signup`: name, surname, DOB, email, mobile, password ×2, consents) confirms the email once with a 6-digit code; "Forgot password?" sends a code and sets a new password (then signs in again, as changing it ends sessions). Accounts from the code-only days set a password with Forgot password. A confirmed email can't be re-registered (no password is set before the email is proven). Studio admins land on `/admin` (Footer "Studio sign-in"; admin header "Client view ↗"). Demo: client password `reform-demo` for `@example.com` demo clients, admin password = `DEMO_ADMIN_CODE`.
- **Rewards & discount codes (round 4, `discount_codes`, `src/lib/discount.ts`, `src/lib/rewards.ts`):** a personal reward (client page → Rewards; `RW-XXXXXX`, one use, optional end date, emailed with template `reward`) is applied by itself on their next package request; codes anyone can type (Clients → Discount codes, e.g. SUMMER10; optional end date and total limit) go in "Have a code?" on Packages (`checkCodeAction`, rate-limited). % or € off the full price replaces the student price when lower (no stacking); free classes are added to the package inside `confirm_payment` (same transaction, `admin_adjust_lot` add, ledger); a shared code's total limit is enforced by the trigger `guard_code_uses` (code row locked, `code_used_up`). A pending or paid request counts as a use; `payments_one_code_per_client` makes it once per client; an expired/removed request frees it. Shown as `payments.discount_note` on Today, Awaiting payment, Payments and the receipt. Round 5: each code/reward says what it applies to (`applies_to`: trial, drop_in, package, event; free classes = package only); on a class/event page "Have a code?" (`checkSingleCodeAction`) and her rewards apply to the unpaid single-class payment in `bookSingle`.
- **Freezes (round 4, her answer):** Adjust package → Freeze has From–To (`lot_freezes`); `lot_usable_for` refuses that package inside the dates (`package_frozen`), the end date moves by the same days (ledger `freeze_extension`); refused if they're already booked in the range (`booked_in_freeze`).
- **Attendance (her answer):** past classes show Attended / No-show / Not marked per client (`Attendance`, `setAttendance`), editable any time; "active client" means paid (an unpaid trial is not active).
- **Events (round 4):** "Event" everywhere (no "special event"); price €0 = free (`bookFree`, `paid_with='free'`, trigger `guard_free_booking` refuses free online bookings of priced sessions); optional `signup_question` (answers in `bookings.answer`, shown on her roster); manual add takes first/last name, phone, email and a note (`bookings.note`) for people who aren't clients yet. The home page shows the next event above "Next available" (blurred if clients-only and they can't see it).
- **Health questions** (`/health`, two steps, `src/lib/health.ts`; no "PAR-Q" label, it isn't legally required): required at sign-up (welcome → `/health?next=`) and before booking for older clients. Step 1 is her checklist (`CONDITIONS`) or "No injuries or medical conditions"; step 2 asks for details, pregnancy (current → weeks; past → months ago), blood-pressure/heart medication, other medication. `needsClearance()` (surgery, pregnant now, birth ≤3 months) sets `health_notes.clearance_needed`; the roster flags "Doctor's note needed" until she taps Doctor's note received. Step 1 also offers "I'd rather tell my instructor in person" (stores nothing, consent row `health_declaration_offline`, `profiles.health_mode='in_person'`, roster flag "Health: tell in person"; booking stays open). Anything stored needs the separate explicit health consent (never pre-ticked; once on file it shows "You consented on …"; version `HEALTH_CONSENT_VERSION`; one rule `needsHealthConsent()` for form and server); "none" stores nothing but `profiles.parq_completed_at`. Saved atomically by `save_health_answers()`; "none", "in person" and Account → Health → "Delete my health information" (`withdraw_health_consent()`) delete the notes and all history and record `granted=false`. Only admins with `profiles.can_view_health` (the instructor; bootstrap `HEALTH_VIEWER_EMAILS`, demo defaults to `ADMIN_EMAILS`) read answers, in RLS (`can_view_health()`) and in every admin render (`canViewHealth()`); other admins see only the flags (A-001). Emails state the cancellation policy and link to Account → Notifications, where clients can turn reminders off (`profiles.reminder_emails`). Her roster flags Birthday, First class, Under 18, Trial, Drop-in, No photos / No face.
- **Legal texts (WP8):** Privacy, Cookies, Health & Safety acknowledgement (`/legal/health`) and Accessibility live in `src/lib/legal.ts`, the default Terms in `src/lib/terms.tsx`; all follow the settings (cutoff, window, `retention_*`) and show the trader identity as `[placeholders]` until filled in. `docs/PRIVACY.md`, `TERMS.md`, `WAIVER.md`, `COOKIES.md` are generated from them (`npm run legal:docs`; a unit test fails if they drift). `policy_versions` versions each text by hash (`record_policy_version`, `src/lib/policy-versions.ts`); sign-up/welcome record one `consents` row per accepted doc (terms, studio_rules, payments_policy, waiver) with `doc_version_id`; package requests store `terms_version_id` + `accepted_terms_at`. No fitness declaration is recorded any more.
- **Rules pages (round 5):** `/policy` is the Studio Rules only and `/policy/payments` the Payments & Cancellation Policy only, both plain like the Terms (no flowers). The fitness tick is gone from sign-up/welcome; the Studio Rules default says booking confirms they're fit to exercise. **The Terms are editable** (Your texts → Terms; "## " headings, "- " bullets; `src/lib/terms.tsx`); saved only if different from the default, which follows her settings. Default wording per her notes (class type "for example, Reformer", events don't use classes, no auto-renew → choose a new package in the app, studio cancellations return the class, no cash refunds).
- **Her texts** are editable by her (Admin → Settings → Your texts, table `site_content`), falling back to the defaults in `src/lib/policy.ts`. They're reused across the policy pages, the first-class welcome, "What to bring" (on each class) and The Studio page (title, photos, then her text). The Magic is no longer shown (its text and photo stay saved, hidden in Settings).
- **Studio team:** she adds or removes admins in Admin → Settings → Studio team (`profiles.role`). Someone without a login yet is an invite (`team_invites`, "hasn't signed in yet") until they first sign in with a code (Create account or Forgot password). `ADMIN_EMAILS` is only the bootstrap, also granted on a code-checked sign-in.
- **Client navigation:** Home (logo, "Welcome back, name" for clients, her intro line, "Secure your package", next class, lavender pills Studio · Events · Rules & policies, upcoming event, Next available) · Schedule · My classes (My profile / My progress: current package cards, upcoming, past packages with X/Y) · Account (drop-down sections: Your details, Health, Receipts, Privacy & data).
- **Keep it simple:** 5 admin tabs (Today, Classes, Clients, Stats, Settings); less-used tools sit inside Classes and Settings. Settings shows the essentials first, with technical options under "Advanced". Every admin page but Today has a Back button (`AdminTitle back=`).
- **Studio notes, round 1** (`docs/feedback/elysia-studio-notes-1.md`):
  - Classes: swipeable `DayStrip` (shared with the client Schedule), opens on the next day with classes; class page lists "Clients".
  - Timetable repeats: the newest template (`timetable_templates.repeats`) is topped up ~9 weeks ahead by `extend_timetable()` on every tick; saving a new one calls `replace_timetable_from()` (older templates stop; their empty future classes from that date are deleted, booked ones kept). `generate_sessions` skips confirmed closure days. Top-ups only add the new days (`generate_sessions_range`) and never create a class where one of that type already exists at that time (cancelled included): the `class_sessions_no_dupe` index only covers scheduled classes, so without this her cancelled or moved classes came back.
  - Clients: Active (live package classes or an upcoming booking) / Not active, alphabetical, name + phone, birthday cake + `sendBirthday` (template `birthday`, once a year per client).
  - Client page (`src/lib/client-history.ts`): Packages / Attended / No-shows boxes (no-show = `no_show` + `late_cancelled`), current package card, details & notes, health history (`health_history`, a copy on every save; studio only; erased with the account; in the data export), student, Adjust package (`admin_adjust_lot`: extend / freeze / end / add / remove, all ledger entries; `giveClasses` for classes with their own end date), History grouped by package, Payments and Ledger as drop-downs.
  - Stats: this week + fill rate by day; **Month** drop-down (bookings, fill rate, revenue, new clients, Reformer vs Mat, package classes used/expired); **Year** drop-down + "Show" (revenue, packages sold, fill rate, bookings, new clients) as one bar per month from `stats_months(year)` (SQL, so no row limits), payments by method for that year. "Monthly recurring" removed (memberships are off).
  - Settings (round 4): collapsible groups (Your studio, How clients pay you, Booking rules, Message on every page, Advanced, Class types, Packages). Class types have no price; event types have no capacity/minutes/credits (set per event). Packages: list + "Add a package" (name generated "Reformer · N classes · M month(s)"); no price grid.

## Decisions (and why)
| Decision | Why |
|---|---|
| Email + password sign-in (round 4); a 6-digit code confirms the email once and resets a forgotten password (no magic links) | Her request: clients asked for passwords. Instagram's in-app browser breaks magic links, so codes are generated with Supabase Auth's admin `generateLink` and delivered by our own notification service (Resend); we control the template and demo mode can show them. |
| `APP_ENV=production` forces demo mode off whatever `DEMO_MODE` says | The real app can never show login codes on screen or seed/reset demo data by mistake. |
| Real app without an email key refuses sign-in with a clear message; login codes aren't stored in the Outbox once email is live | Never claim a code was sent; nobody reading the log can sign in as a client. |
| Rate limits in SQL (`rate_limited()`, table `rate_events`, keys are HMACs with `RATE_LIMIT_SECRET`, else `CRON_SECRET`): code requests 5/email & 20/IP per 15 min and 200/hour in all (the studio gets an alert), code attempts 10/email & 50/IP, password sign-in 10/email & 50/IP per 15 min, discount-code checks 10/client per 15 min, booking-type actions 30/client per 10 min. Sign-in and code limits fail closed if the check errors; booking limits fail open. Client IP from `x-vercel-forwarded-for` / `x-real-ip` (`clientIp()`, assumes Vercel) | Stops guessing codes/passwords and runaway scripts without bothering real clients. |
| Logins are linked to client records only once the email is proven (`handle_user_confirmed`: a code used after the login was created; the app links in its code-checked paths and demo passwords via `profileFor(…, { verified })`). Lookups by email are exact (`normEmail`, stored lower-case), never `ilike`. Studio-team members who haven't signed in are `team_invites`, granted admin on their first code-checked sign-in; a password sign-in alone never grants admin | Supabase's own Auth API is a second way in that the app can't fully control (A-002): a login made there must never inherit an imported client or an admin invite. |
| Codes are emailed only to existing logins (confirmation codes only to an unconfirmed sign-up); sign-up details are used only in the browser that typed them (httpOnly `rf_signup` cookie, its hash on the login), otherwise `/welcome` asks again and the password typed elsewhere is dropped | Nobody can make the studio's domain email strangers, or put their own name, phone or password on someone else's pending account. |
| Account enumeration accepted: sign-up and sign-in say "There's already an account" / "doesn't have a password yet" (A-087) | Clear messages for clients matter more here; it's rate-limited (10/email, 50/IP per 15 min) and Forgot password doesn't reveal accounts. |
| Demo mode shows client codes on screen, never admin codes | So the preview can be clicked through without email. Admins sign in with `DEMO_ADMIN_CODE` as the password; otherwise anyone could open the admin on a public preview. |
| Booking engine in Postgres functions (`book_session`, `cancel_booking`, `process_waitlist`, …) that `SELECT … FOR UPDATE` the class row | Guarantees no double-booking of the last reformer under concurrency (tested with 6 parallel requests → exactly 3 succeed). |
| Server is the only writer (service role); engine functions executable only by `service_role`; RLS lets clients read only their own rows | Defence in depth if the public anon key is used directly. Health notes: client reads own, instructor reads all, writes server-side so consent is logged. |
| Health note in a separate table with separate explicit consent | GDPR art. 9 special-category data. |
| Waitlist offer reserves the spot (`spots_taken` counts live offers) | The offered person can't be beaten to it while they decide. |
| Payment layer behind `PaymentProvider` (Stripe Checkout today, mock without keys, Viva.com stub) | Viva Wallet is common in Cyprus; Stripe-hosted checkout means no card data touches us. |
| Notification service writes every message to `notifications` (the admin Outbox) and only sends when the provider is configured and demo mode is off. Providers time out after 8 s; a failed send is retried by the tick with backoff (`attempts`, `next_attempt_at`, 5 tries, never after the class starts or an offer closes; Outbox "Send again"); "duplicate" only for a real dedupe-key conflict. Messages after a tap go out in `after()` (`later()`) | Demo-safe; doubles as a message log. Transactional only; marketing must never go through it. A slow provider never holds up a tap. |
| Reminders and waitlist advancing run in `runTick()`, called every 5 minutes by Supabase **pg_cron + pg_net** → `GET /api/cron/tick` (Bearer `CRON_SECRET`). `scripts/migrate.mjs` (re)creates the job `reform-tick` on every production deploy from `NEXT_PUBLIC_SITE_URL` + `CRON_SECRET`. Each step runs on its own (`step()`; one failing step never skips the timetable top-up or weekly bookings); reminders come from `due_reminders(offset)` and low credits from `low_credit_groups()` in SQL, messages 5 at a time. Page views tick only when the last tick is ≥10 min old (fallback). Heartbeat written last: `last_cron_tick_at` (ran), `last_tick_ok_at` (all steps worked), `last_tick_error`; the cron route answers 500 on a failed step; Today and the Outbox show the error, admin warns after 20 min | Vercel Hobby cron is daily only; pg_cron is free and inside the database. |
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
| Per-person rules (one unpaid class, one trial per type and phone) take `pg_advisory_xact_lock`s in `book_session` before checking; Mark as paid on a late-cancelled / no-show / cancelled class only records the fee (`fee_paid`), never re-books; pack payments must be for a package (`not_a_package`); one pending request per client and package (`payments_one_pending_request`); closures and "cancel today" are one transaction (`confirm_closure`, `cancel_sessions`); class edits go through `update_session` (capacity vs `spots_taken`, `type_locked`, closed days, packages); no-shows only after the start (WP3) | The class row lock alone didn't cover rules across classes, and multi-step TS loops could half-finish. |
| A trigger cancels the pending payment when an unpaid trial/drop-in booking is released (cancelled in time, studio-cancelled, expired); late cancels and no-shows keep it for her to decide (Remove button) | Otherwise it lingers in "Awaiting payment", blocks the trial, and Mark as paid would re-confirm a cancelled booking. |
| Redirect targets (`next`) go through `safeNext()` (`src/lib/safe-next.ts`) | `/\\evil.com` passes a plain "starts with / but not //" check and browsers treat it as another site. |
| Forms submit through `keepValues()` (`src/lib/keep-form.ts`) instead of `<form action>` | React 19 resets `<form action>` forms after every submit, wiping what people typed when there's a validation error. |
| Demo reset keeps products, photos and settings | Her edited prices survive "Reset demo data". |
| Data a migration must only load on the real app checks `current_setting('app.env')`, set by `scripts/migrate.mjs` | Fresh demo/local databases run the same migrations before their demo seed; without it her timetable would also land in the demo |
| New class types extend the `credit_kind` enum at runtime (`add_credit_kind`) instead of converting it to text | Every booking function, index and ledger rule keeps working; enum values can't be dropped, so a deleted type just leaves an unused value |
| Writes check their result (`must()`, admin `failed()`); multi-step saves are one SQL function (`save_timetable`, `onboard_profile`, `replace_recurring_rules`, `save_health_answers`); every `raise exception` code has words in `src/lib/errors.ts` (unit test); branded `error.tsx`/`global-error.tsx`/`not-found.tsx`; reads (GET) retry once; `db_unavailable` instead of `null` (WP6) | A failed write must never say "Saved", and a phone that loses a response must not see "Application error" or be signed out. |
| Erasure: `eraseProfile()` (`src/lib/erase.ts`) runs `erase_profile` v7 first (Outbox rows to/about/naming them via `notifications.about_profile_id`, notes, rate keys, invites, auth log; waitlist moves up) and deletes the login only after it succeeded; the studio can export/erase any client (client page → Privacy & data). Retention: `enforce_retention()` once a day from the tick, periods in `studio_settings.retention_*` (NULL = off), counts only in `audit_log`; the ledger allows a note-only update under `app.erasing` and deletes only under `app.retention` (WP7) | GDPR art. 5(1)(e), 15, 17, 20; the periods are the owner's decision (open question A-011). |
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
- **Real studio app (production):** https://book.reformpilatescy.com (domain `reformpilatescy.com` on Cloudflare; CNAME `book` → Vercel, DNS only; email will come from `mail.reformpilatescy.com` via Resend), Vercel project `reform-studio`, Supabase **reform-prod** (Frankfurt, free). `APP_ENV=production`, `DEMO_MODE=false`. **Email is live** (Resend domain `mail.reformpilatescy.com`, EU, verified with SPF/DKIM/DMARC; send-only key in `RESEND_API_KEY`; `EMAIL_FROM=Re·Form Pilates <hello@mail.reformpilatescy.com>`; replies go to `EMAIL_REPLY_TO=rf.reformes@gmail.com`, falling back to the Settings contact email). Only the baseline (settings, class types, packages) is seeded; never reset.
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
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e   # 11 flows (incl. hidden tabs): sign-up/password/reset, booking, cancel, waitlist, packages, rewards, building a class type, admin access
npm run test:engine          # booking-engine tests (local Supabase)
npm run test:unit            # pure TypeScript helpers (no database)
npm run test:notify          # notifications (retry, timeouts) and tick isolation, provider stubbed (local Supabase)
# Stripe webhooks (signature, credits once, expired): start the app with test-only keys, then
STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_test_dummy npx next start -p 3002 &
npm run test:webhook
npm run db:types              # after schema changes
```
- **Live admins:** petridesart@gmail.com and elysia.stephani@gmail.com (`ADMIN_EMAILS` in Vercel); more can be added in Admin → Settings → Studio team.
- **Admin login (local):** `studio@example.com` with password `DEMO_ADMIN_CODE` (24681357 locally). Demo clients such as `elena@example.com` sign in with password `reform-demo`; new sign-ups see their confirmation code on screen.
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
  - Her round-2 client notes (`docs/feedback/elysia-client-notes-2.md`): two-step health questions with doctor's-note flag, account drop-downs, packages one per line with the 6h rule in the terms, no colour strip, simpler Studio page, customisable and clients-only events with an archive.
  - Her round-1 client notes (`docs/feedback/elysia-client-notes-1.md`): her logo, real prices, cash/Revolut choice, trials and drop-ins, weekly repeat bookings, 3-state colours, new My classes with package progress, new Account, Studio / Events / Rules pages, Back buttons, Photos manager.
  - Admin: Today (awaiting payment with chosen method, roster flags), classes, timetable, closures, clients (profile, health behind a tap, student verification, holiday return, ledger), Outbox, stats, import, settings (price grid, booking window, studio sections), photos, compliance.
  - PWA manifest and icons, Open Graph previews.
  - 54 engine tests + 3 webhook tests + 10 Playwright flows green on a production build (hardening WP3: 82 engine tests, 20 e2e).
  - Her studio notes, round 1: back buttons, Classes day strip, repeating timetable, Active/Not active clients with birthdays, new client page with package adjustments and health history, new Stats.
  - Polish: "To pay" on unpaid classes, trials matched by phone, photo captions/reordering.
- **Waiting on the owner (questions in the brief):**
  - Answers to the open questions in `docs/feedback/elysia-client-notes-1.md` (euro and DOB required are answered; defaults are live for the rest) and `elysia-client-notes-2.md` (who counts as a client, event cancellation cutoff), and `elysia-studio-notes-1.md` (unpaid trial = active?, freeze blocking bookings, birthday wording, auto-attended).
  - Her Revolut link, IBAN, original logo file and photos (she can upload them herself now).
  - Address, her full name, contact details.
- **Her notes, round 3** (`docs/feedback/elysia-notes-3.md`): package names, home/studio simplified, waitlist 1h rule, Reformer-vs-Mat notice, fill rate %, her name, waitlist SMS switch, demo birthday (Sofia's birthday is always today in demo mode, set on each tick).
- **Her notes, round 4** (`docs/feedback/elysia-notes-4.md`, migration `20261025001900_round4.sql`): passwords + create account + forgot password, studio lands in the studio, 18+, events (free, question, details for new people, private home card), home pills, weekly inside packages, plain cake, stats history, settings drop-downs, class types without prices, her answers (no grace, SMS off, unpaid trial not active, freeze From–To, editable attendance), rewards & discount codes. Open questions in the brief (rewards on trials?, code vs student discount, pre-natal packages).
- **Her notes, round 5** (`docs/feedback/elysia-notes-5.md`, migration `20261101000100_round5.sql`): class types and offers she builds herself (own packages, trials, drop-ins, delete), codes by target, studio emails, no fitness tick, clean fonts + event title fonts, Home only her content, separate plain rules pages, editable Terms, lavender "spots left". Studio owner guide and client guide PDFs in `docs/guides/`.
- **Her notes, round 6** (`docs/feedback/elysia-notes-6.md`, migrations `20261103000100_round6_kinds.sql` + `…0200_round6.sql`): Packages page tabs, Pre & Post Natal and Private set up but hidden, private sessions, her real packages and her timetable on the real app, booking window up to 26 weeks with classes created beyond it. Her two questions answered in the brief (manual adds take a spot; weeks ahead is a setting).
- **Pre-launch check (31 Oct):** all tests green; every page loads on local, demo and real app; Supabase advisor fixes in `20261025001800` (remaining advisor notes are intended: server-only tables without policies, `is_admin`/`my_profile_id` used by RLS, `pg_net` in public, password check n/a with email codes).
- **Hosting plan (owner's decision):** Vercel Hobby during the soft launch; upgrade `reform-studio` to Pro before the link goes in her Instagram bio (`docs/launch/0-checklist.md` step 6).
- **Proposed v2:**
  - Wallet passes, auto-renewing memberships (code exists, flagged off), corporate accounts, referrals, gift vouchers.
  - Private feedback, demand insights, Greek/Russian, motion system with sheets/gestures.
