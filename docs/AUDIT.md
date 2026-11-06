# Production-hardening audit: triage

Branch `hardening-pass` (base commit `710153f`), 6 Nov 2026. This file merges and de-duplicates eight read-only audit reports: security, booking, time, performance, reliability, UX, legal and quality. The raw reports are kept in the session scratchpad (`audit/*.md`).

Every source finding ID appears in exactly one row below. Severities were re-assessed on one scale for all eight areas:
- **Critical:** loss of personal or financial data, an unlawful core flow, or account takeover.
- **High:** a wrong money, credit or policy outcome, a core flow broken or badly misleading, or data silently lost.
- **Medium:** a correctness risk with limited reach, a compliance gap that is not core, or a notable UX or a11y defect.
- **Low:** hygiene or an edge case.

---

## 1. Summary

**De-duplicated findings: 110** (from 162 source findings):

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 27 |
| Medium | 49 |
| Low | 31 |

The auditors' own header totals add up to Critical 1 · High 36 · Medium 60 · Low 64. SEC-08 was rated "Medium/Low".

**Dispositions:**

| Disposition | Count |
|---|---|
| fix now | 89 |
| fix now (code) + owner action | 15 |
| fix now (code) + needs Elysia's input | 2 |
| needs Elysia's input | 2 |
| needs owner's input | 1 |
| out of scope (feature / v2) | 1 |

**Overall posture.** The core of the app is sound.
- The booking engine is in Postgres, row-locked and ledger-backed. Concurrency was verified: capacity and credit spend never overshoot, Mark as paid and cancel are idempotent, and the ledger invariant holds.
- RLS is on for every table, engine RPCs are revoked from anon and authenticated, and there are no secrets in the bundle.
- Timezone handling is consistent (Nicosia everywhere, DST-safe timetable and validity), and Lighthouse accessibility is high.

The weaknesses are at the edges:
1. **Per-person rules that lock only the class row.** Parallel trials and unpaid bookings get through, and the waitlist can be jumped. Mark as paid on a late-cancelled class re-books the client.
2. **Failure handling.** Unchecked Supabase errors report success, failed emails are never retried, the tick has no isolation and its heartbeat is written first, there are no error boundaries, and there is no provider timeout.
3. **GDPR and consumer law.** Health consent is effectively mandatory and is pre-ticked. Erasure, retention, acceptance records and withdrawal information are incomplete, and the privacy and cookie pages are placeholders.
4. **Things only the owner can verify:**
   - hosted Supabase Auth settings, which decide whether unlinked profiles can be taken over;
   - backups on the free plan;
   - the Vercel function region.

The three Critical items are A-001, A-002 and A-003. Two of them need owner action in hosted dashboards that code alone can't close. These dashboard checks should start now, alongside WP1.

---

## 2. Ground rules applied

1. **Scope freeze: no new features.** Fixes may add guards, SQL functions, columns, tests, error pages and compliance text. Anything that adds a new user capability is listed in §6. Legally required items are the exception, and each one is flagged: withdrawal and consent controls, and an erase/export path for the studio.
2. **Payments stay off and in test.** `online_payments_enabled` stays false and no live Stripe keys are added. Fixes to the mock or Stripe paths (A-040) only tighten them, so they can never grant classes in production. Offline Mark as paid is the live flow.
3. **Policy source of truth.** CLAUDE.md "Studio rules" is Elysia's approved policy, and the "Decisions" table holds the agreed technical trade-offs.
   - Where an audit fix would change an approved rule, it goes to **needs Elysia's input** (a studio-policy question) or **needs owner's input** (a legal or business decision). In both cases the exact question is stated.
   - Legal-wording changes that contradict her approved text (refunds, "no cash refunds", 14-day withdrawal) are implemented as **compliant defaults** in the Terms and policy defaults. They are flagged for the owner, and she can still override the texts in "Your texts".
4. **Database discipline.**
   - Never edit an applied migration. Every SQL change is a new file after `20261103000300_mat_four_spots.sql`, run by `scripts/migrate.mjs`.
   - New enum values are added in their own migration file before any function uses them. `ALTER TYPE … ADD VALUE` can't be used in the same transaction.
   - Afterwards run `npm run db:bundle` and `npm run db:types`.
5. **No behaviour or visual-design change beyond polish.** The brand rules in CLAUDE.md apply (palette tokens, Inter, 22px cards, `prefers-reduced-motion`).
6. **Health data.** It is never put in emails, logs, alerts or the Outbox, and every change to it goes through server-side code that records consent.
7. **Working agreement per work package:**
   - tests green (`test:engine`, `test:webhook`, `test:e2e`, typecheck, lint);
   - screenshots of changed screens at 390px;
   - a separate security review for RLS, health data and admin routes;
   - one commit;
   - CLAUDE.md updated.
8. **Unverified items.** Auditors lost the local stack partway through. Before fixing, re-run these against local Supabase:
   - the booking cases marked "(not verified)": `booking-audit/flows.mjs` cases A–L;
   - the legal erasure flow: `legal-audit/flow.cjs`.

   UX items marked [code] need a device check after the fix.

---

## 3. Findings

Columns:
- **Sev:** the triaged severity, with the change from the source rating in brackets.
- **Sources:** the merged source IDs.
- **Disp.:** the disposition. FN = fix now; FN+O = fix now (code) + owner action; FN+E = fix now (code) + needs Elysia's input; E = needs Elysia's input; O = needs owner's input; OOS = out of scope.

### 3.1 Critical

| ID | Finding | Sev | Sources | Location | Problem | Fix | Disp. |
|---|---|---|---|---|---|---|---|
| A-001 | Health-data consent is a condition of booking, misdescribes who sees it, is pre-ticked, and can't be withdrawn | Critical (LEGAL-02/03 High → folded in) | LEGAL-01, LEGAL-02, LEGAL-03 | `src/app/(client)/health/HealthWizard.tsx:132-136` (text; `:133` `defaultChecked`); `src/lib/profile.ts:46-69`; `src/app/(client)/account/page.tsx:62-87` | (1) A client with a condition must consent to storage, or they can't save the questions and so can't book or request a package. That consent isn't freely given (GDPR 7(4)), and 9(2)(a) is the only Art. 9 basis available. (2) The text says "Only my instructor sees it", but `is_admin()` gives every studio-team account (including the developer) full read access. (3) The box is pre-ticked for returning clients (*Planet49*). (4) There's no withdraw control. Ticking "No conditions" deletes `health_notes` but keeps all of `health_history`, and no `granted=false` row is written. | **Choice:** add a step-1 answer "I'd rather tell my instructor in person". It stores no answers, sets `parq_completed_at`, records a consent row `health_declaration_offline`, and the roster shows "Health: tell in person". **Consent:** new consent text naming the controller (placeholder) and the team; `defaultChecked={false}`, or "Consented on <date> · Withdraw" when already given; store `HEALTH_CONSENT_VERSION` on the consent row. **Withdraw:** `withdrawHealthConsent()` plus a "Delete my health information" button in Account → Health, which deletes notes and *all* history, inserts `granted=false` and sends a content-free studio alert. "No conditions" after earlier answers does the same. **Visibility:** `profiles.can_view_health`, enforced in RLS and in every admin render. Others see only the "Doctor's note needed" flag. **Privacy:** fix the Privacy row (A-013). | FN+O. Owner: (a) confirm the in-person option and the consent wording; (b) who gets `can_view_health` (proposed: Elysia only); (c) remove or limit `petridesart@gmail.com`'s admin role on production after launch. |
| A-002 | Supabase Auth API bypasses the app and can adopt unlinked client or admin profiles | Critical (from High-conditional: the worst case is admin plus health-data takeover, and the hosted settings can't be verified from here) | SEC-01 | `supabase/migrations/20261011000200_functions.sql:471-488` (`handle_new_user`); `src/app/admin/actions.ts:916-925` (`addTeamMember` pre-creates `role='admin'`, `user_id null`); `supabase/config.toml:177,227,229` | `handle_new_user` links any unlinked profile with the same email to a new auth user. Anyone with the public anon key can call `/auth/v1/signup`, `/otp` and `PUT /user` directly. If hosted sign-ups are on and confirmation is off, signing up as a pending Studio-team email yields an admin session. The same works for imported, DM or manual clients. With autoconfirm, `PUT /user {email}` moves emails without a check. | New migration: `handle_new_user` links only when `email_confirmed_at is not null`, plus an `on update` trigger that links at confirmation. Pending admins go in a `team_invites` table, and the role is granted in `profileFor` only after a code-verified sign-in; never pre-create admin profiles. Mirror the hosted settings in `config.toml`: `enable_confirmations=true`, `secure_password_change=true`, secure email change. Document them in `docs/launch/2-production.md`. | FN+O. Owner: in **reform-prod** and **reform-db**, set "Allow new users to sign up" off, "Confirm email" on, "Secure email change" on, and "Secure password change" on; report the current values. Confirm the hosted demo's `DEMO_ADMIN_CODE` ≠ `24681357`. |
| A-003 | No backups and no restore procedure for production; `setup.sql` seeds demo data | Critical (from High: the ledger and payments are her 6-year accounting record; a lost or paused free project, or a bad migration, can't be undone) | REL-04 | CLAUDE.md Deployment ("reform-prod … free"); `docs/launch/0-checklist.md:19-20`; `docs/running-costs.md:8,18`; `supabase/setup.sql` (ends with `seed_demo()`) | The free plan has no restorable daily backups or PITR. There's no `pg_dump`, no copy of the `media` bucket and no runbook. `auth.users` can only come back from a DB-level dump. `setup.sql` always seeds demo clients and never sets `app.env`, so her timetable isn't loaded. | Code/docs: write `docs/launch/3-backup-restore.md` (restore into a new project, run `migrate.mjs` with `APP_ENV=production`, re-create the cron job, re-point the Vercel env, verify `remaining = sum(ledger)`). Add a nightly GitHub Action template for `pg_dump --format=custom` (including `auth`) and a `media` bucket copy, with secrets supplied by the owner. Put a "DEMO ONLY: seeds demo data" header on `setup.sql`, or bundle the seed separately. | FN+O. Owner: upgrade reform-prod to Pro before the bio link, and/or approve the nightly dump (DB URL secret and a destination the studio owns). Run one restore drill. |

### 3.2 High

| ID | Finding | Sev | Sources | Location | Problem | Fix | Disp. |
|---|---|---|---|---|---|---|---|
| A-004 | Parallel requests get two trials, or several unpaid classes | High | BOOK-02 | `supabase/migrations/20261025000800_trial_by_phone.sql:11` (`trial_eligible`), `:28` (`book_session`) | The trial and "one unpaid class" checks run under a lock on the class row only. Two requests for different classes both pass. Verified in `race.mjs` cases 6–8: two trials, two unpaid drop-ins, and two accounts sharing a phone. | In the new `book_session`, for trial, drop-in and pay-at-studio, take `pg_advisory_xact_lock(hashtext('unpaid:' + profile))`. For trials also lock `hashtext('trial:' + kind + ':' + coalesce(phone_key, profile))`. Re-run the checks after locking. | FN |
| A-005 | Waitlist can be jumped: a freed spot is open to anyone before `process_waitlist` runs | High | BOOK-04 | `src/lib/booking.ts:377-410` (cancel → 2 emails → `process_waitlist`); `20261025001700_studio_notes_2.sql:71` (`cancel_booking`); `20261025000800…:28` | The gap lasts seconds (Resend calls), or up to the next tick if the action dies. Verified in `race.mjs` 3: a non-waitlisted direct booking took the spot. No-show edits, erasure and hold expiry also free spots without advancing the queue. | `cancel_booking` (and the erase and expiry paths) call `process_waitlist` inside the same transaction and return the rows to notify. In `book_session`, online bookings are refused with `waitlist_first` while `waiting` entries exist and the class is outside the waitlist close. | FN |
| A-006 | Mark as paid on a late-cancelled or no-show unpaid class re-books the client, or marks the fee "needs refund" | High | BOOK-01 | `20261011000800_studio_policy.sql:253` (`confirm_payment` booking branch); `src/lib/booking.ts:294`; `src/app/admin/page.tsx:39,86` | Any status other than `confirmed` is treated as a lapsed hold. The client is put back in the class and emailed "confirmed · Paid", or, if the class is full, the fee goes `needs_refund` with a Stripe banner. A no-show becomes "confirmed". | For a `booking` payment whose booking is `late_cancelled`, `no_show`, `cancelled` or `studio_cancelled`: mark the payment paid, set `paid_with='payment'`, leave `status` alone and return `fee_paid`. Only `held` goes through re-confirm or needs_refund. `onPaymentPaid` sends no confirmation for `fee_paid`. | FN |
| A-007 | A trial or drop-in product can be requested as a "package", giving cheap credits that never expire | High | BOOK-03 | `src/lib/booking.ts:177-223` (`buyProduct`); `src/app/(client)/packs/actions.ts`; `confirm_payment` pack branch (`20261011000800…:253`) | The server action accepts any active product id. Mark as paid then grants a lot with `validity_days=null`, which has no expiry and skips trial eligibility. | `buyProduct` refuses unless `tag in ('package','membership')`. `confirm_payment` raises `not_a_package` for a `pack` payment whose product is single. | FN |
| A-008 | Email lookups use `ilike`, so `_` and `%` act as wildcards (profile linking, admin promotion) | High (SEC-09 Low → raised: QUAL-01; the over-match is verified, and linking hands one person's packages and health flags to another) | QUAL-01, SEC-09 | `src/lib/auth.ts:29-31`; `src/lib/auth-flow.ts:18-20,56-58`; `src/app/admin/actions.ts:74,848,920`; `src/app/(client)/login/actions.ts:47-48,87,114` | `maria_k@…` matches an imported, unlinked `maria.k@…`, and `ensureProfile`, `addTeamMember` or `manualBook` attach the wrong person. Several matches make `.maybeSingle()` error silently, which creates duplicate profiles. | Add a `byEmail(q, email)` helper using `.eq("email", email.toLowerCase())` everywhere. The unique index `lower(email)` already exists; add a migration that lower-cases any stored mixed-case emails. Add a test with an underscore address. | FN |
| A-009 | Acceptance of Terms, Rules and package terms isn't versioned; package and single-class acceptance isn't stored | High | LEGAL-04 | `src/app/(client)/packs/actions.ts:19`; `src/lib/booking.ts:194-219`; `src/lib/auth-flow.ts:96-101`; `src/app/(client)/welcome/actions.ts:36-43`; `src/app/admin/actions.ts:899-913`; `src/app/admin/settings/page.tsx:145` | Every document is stamped with one manual `policy_version`, editing the texts never bumps it, and no wording is archived. The package-request tick isn't stored. Trials, drop-ins and events have no acceptance step. | **Versions:** new `policy_versions(doc, version, sha256, body, created_at)` table. `saveTexts` and `saveSettings` insert a new version when the effective text's hash changes; drop the manual "Policy version" field. **Records:** `consents.doc_version_id`, one row per doc at sign-up and welcome. `payments.terms_version_id` and `accepted_terms_at` are set by `buyProduct`, `bookSingle` and `bookFree`. **Acceptance:** single and event bookings get the same "I accept…" tick, checked server-side. When a version changes, a one-tap re-accept sheet appears before the next booking (`onboardedProfile`, `buyPackAction`). | FN |
| A-010 | Erasure leaves identifiable data behind | High | LEGAL-05 | `supabase/migrations/20261025001900_round4.sql:331-355` (`erase_profile`); `src/app/(client)/account/actions.ts:73-82`; `src/lib/studio-alerts.ts:27` | These survive erasure: studio-alert Outbox rows (`profile_id NULL`, with name, email and phone), message subject, error and `provider_ref`, sign-up code rows, `otp_requests` hashes, `credit_lots.note`, `lot_freezes.reason` (may hold health words), `stripe_customer_id`, `student_verified_until`, and `auth.audit_log_entries`. The auth user is deleted even when `erase_profile` errored. | New migration with `erase_profile` v7: erase by a new `notifications.about_profile_id` (`alertStudio` passes it) plus recipient, email and phone matches; blank subject, body, error and `provider_ref`; delete `otp_requests`; clear lot notes and freeze reasons (ledger `note` through a narrow exception in `ledger_append_only`); null the remaining identifiers; purge the user's `auth.audit_log_entries`. `deleteAccount` deletes the auth user only after `erase_profile` succeeds, and shows an error otherwise. | FN+O. Owner: Resend log retention days for the Privacy Policy, and a deletion practice for the studio mailbox (≤12 months). |
| A-011 | None of the promised retention periods are enforced | High | LEGAL-07 | `src/app/(client)/legal/[slug]/page.tsx:62-68`; `src/lib/booking.ts:428-468` (`runTick`) | The Privacy Policy promises 24-month inactivity deletion, 12 months for messages, and so on, but nothing deletes anything. `otp_requests`, `notifications`, `audit_log`, `health_history`, waitlist rows and old payments grow forever. | Add `enforce_retention()` (service role), called once a day from the tick through `last_retention_at`, using the LEGAL-07 table: rate data 1 day; messages 12 months; audit log 24 months; auth audit log 90 days; event answers, notes and waitlist 3 months after the class; health 12 months after the last attended class, with a 30-day notice; inactive clients erased after 24 months with a warning; payments and the ledger 6 years after year-end (ledger delete only under `app.retention`); personal codes 12 months; consents 3 years after erasure. Log counts only to `audit_log`. | FN+O. Owner: confirm the table, especially health 12 months, auto-erasure after 24 months inactive, and payments 6 years (accountant). |
| A-012 | Prepaid packages: no withdrawal information or Art. 16 handling; trader identity missing where the client requests; "no cash refunds" even when the studio cancels | High | LEGAL-08 | `src/app/(client)/packs/PackagePicker.tsx:122-137`; `src/lib/terms.tsx:15-35`; `src/lib/policy.ts:16-27` (`EVENT_POLICY`); `src/app/(client)/book/[id]/page.tsx:176-180,270-287` | **Packages:** a package is a distance contract, and 16(l) probably doesn't cover "N classes in 30/60 days from the first class". There is no withdrawal information (6(1)(h), so withdrawal extends by 12 months), no express-start or proportionate-payment acknowledgement, and no geographic trader identity at the point of request. **Refunds:** "No cash refunds" even when the studio cancels is a likely unfair term. **Singles and events:** the client isn't told that no withdrawal right applies. | **Terms default:** a section with the 14-day right, the proportionate variant, the model withdrawal form and how to withdraw (email). **Package card:** seller identity, total price "(no VAT charged)" and a one-line withdrawal summary. **Class and event sheets:** the 16(l) notice. **Studio cancellations (default Terms and `EVENT_POLICY`):** "class goes back to your package; extended or refunded if you can't use it; events refunded in full". **Launch block:** `buyProduct` and `bookSingle` are blocked in production while identity placeholders remain (`launchReadiness`). | FN+O. Owner: (a) the withdrawal variant (proportionate is recommended); (b) an in-app "Withdraw" button with a `refund_due` flow, or email only (button = §6 if declined); (c) approve replacing her "no cash refunds" for *studio* cancellations (tell Elysia); (d) fill in the trader name, address, email and phone. |
| A-013 | Privacy and Cookies pages are inaccurate and labelled "Draft placeholder"; Health & Safety and Cookies aren't linked; dead legal text | High (LEGAL-20 Low folded in) | LEGAL-09, LEGAL-20 | `src/app/(client)/legal/[slug]/page.tsx:18-106,116,126,134`; `src/components/Prose.tsx:11-16`; `src/components/Footer.tsx:5-10`; `src/lib/policy.ts:16`; `src/app/(client)/welcome/WelcomeForm.tsx:45` | **Privacy:** says "Health note (optional)", omits DOB, emergency contact, studio alerts, the phone trial check and more, has wrong processors and regions, unenforced retention, and a placeholder contact. **Cookies:** says 1 week (it's 400 days) and mentions a map that isn't rendered. **Health & Safety:** isn't linked anywhere. **Leftovers:** a dead `cancellation` body with "[To confirm with a lawyer]", "memberships" wording, and three different names for the payments policy. | Rewrite Privacy, Cookies and Health & Safety from legal §5, with identity rendered from `business(s)` and visible bracketed placeholders (shown to admins; launch blocked). Remove `DraftNotice`. Footer: Studio Rules · Payments & Cancellation · Terms · Privacy · Cookies · Health & Safety · Accessibility. Delete the `cancellation` entry, say "packages", and use the one name "Payments & Cancellation Policy". Either state the 400-day cookie or set `cookieOptions.maxAge` (for example 60 days) and state that. | FN+O. Owner: legal review before the DRAFT labels go; sign the Supabase and Resend DPAs and download Vercel's; fill in the identity. |
| A-014 | Vercel functions may run in `iad1` (US), far from the Frankfurt DB; studio inbox is consumer Gmail | High (LEGAL-10 Medium → raised with PERF-01: latency on every request, plus personal and health data transiting the US) | PERF-01, LEGAL-10 | `vercel.json:1-8` (no `regions`); `docs/ARCHITECTURE.md:219`; CLAUDE.md `EMAIL_REPLY_TO=rf.reformes@gmail.com`; alert bodies `src/app/(client)/login/actions.ts:92`, `account/actions.ts:52-53` | **Latency:** with a 90 ms round trip, the class page takes 1.28 s of server time and a tick 11 s. **Data:** health answers transit the US. **Mailbox:** studio alerts with client email and phone go to a Gmail account without a DPA. | Add `"regions": ["fra1"]` to `vercel.json`, and list Vercel (fra1 plus the edge) in the Privacy Policy. | FN+O. Owner: (a) check Settings → Functions → Region = Frankfurt for `reform-studio` and `reform-pilates`, confirmed in function logs; (b) move `alert_email` and Reply-To to a Workspace or EU mailbox with a DPA; (c) should studio alerts keep the client's email and phone, or just the name plus a link (data minimisation)? |
| A-015 | Failed emails are never retried, and the dedupe key blocks any retry | High (REL-21 Low folded in) | REL-01, REL-21 | `src/lib/notifications/index.ts:33-54` (`:48` unchecked status update); dedupe keys `src/lib/booking.ts:365,370,420,458,487`; `src/app/admin/outbox/page.tsx` | The row is inserted first and marked `failed` on a provider error, and the next attempt hits the unique key and returns "duplicate". Reminders, waitlist offers (holding a spot), class-cancelled emails and expiry notices are lost for good during a Resend outage. A successful send whose status update fails stays `logged`. | New columns `attempts` and `next_attempt_at`. An upsert re-claims `failed` rows with `attempts < 5`. The tick retries with backoff and skips stale time-sensitive templates (a reminder after the class start, an expired offer). The Outbox gets "Send again" on failed rows. Check the status-update error and store `provider_ref` before a row counts as retryable. | FN |
| A-016 | Every Outbox insert error is reported as "duplicate", so codes "sent" are never sent | High | REL-02 | `src/lib/notifications/index.ts:44`; `src/lib/auth-flow.ts:231-233`; `src/app/admin/actions.ts:305` | Network, timeout and constraint errors all map to `"duplicate"`. `sendCode` returns `ok:true` (breaking "never claim a code was sent"), and `sendBirthday` says "already sent this year". | Return `"duplicate"` only for `23505` on `notifications_dedupe_key_key`; otherwise log and return `"failed"`. Login codes, which have no dedupe key, still attempt the send or return failure. | FN |
| A-017 | No timeout on Resend or Twilio; two to many emails are awaited inside booking, cancel, Mark as paid and closures | High (REL-15 Medium folded in) | REL-03, PERF-05, REL-15 | `src/lib/notifications/email.ts:5-12`, `sms.ts:5-13`; `src/lib/booking.ts:57-68,116-118,144-164,377-421` (`cancelSession` loop), `:294-333`; `src/lib/recurring.ts:143-156`; `buyProduct` (`:208-217`) | A slow provider blocks the tap for up to around 300 s after the DB already committed. The function can time out mid-closure, and the tick can overrun pg_net's 30 s. Even in the normal case it adds 0.4–1 s per tap (2 Resend calls plus about 8 sequential DB trips). | Add `AbortSignal.timeout(8000)` in both providers. Send post-commit notifications (client email, studio alert, waitlist offers, the `cancelSession` per-client loop) in `after()` from `next/server`; dedupe keys keep retries safe. Cache `sessionInfo` and `profileById` per request. Responses depend only on the DB write. `sendCode` stays synchronous. | FN |
| A-018 | The tick has no per-step isolation, and the heartbeat is written first, so a failing tick looks healthy | High | REL-05, QUAL-03 | `src/lib/booking.ts:428-468` (heartbeat `:430`), `:47-50` (`profileById` → `data!`), `:20-21` (`sessionInfo` throws); `src/app/api/cron/tick/route.ts:11`; `src/lib/tick.ts:7` | One missing profile or one throw skips reminders, expiries, `extend_timetable` and `applyRecurring` on every run, indefinitely: the timetable runs dry and weekly bookings stop. RPC errors are ignored, and the Today warning never shows. | Run each step in `step(name, fn)` with try/catch and collect `errors[]`, and give each row its own try/catch. `profileById` returns `null` → `continue`, and the duplicate fetch at `:450/:453` goes. Check `error` on every RPC. Always run `extend_timetable` and `applyRecurring`. Write `last_cron_tick_at` at the end, plus new `last_tick_ok_at` and `last_tick_error` columns. The cron route returns 500 on a failure, and Today and the Outbox show the last error. | FN |
| A-019 | Client-facing writes report success after a failed write (deletion, health, details, consents, weekly rules, new password) | High (REL-18 Low folded in) | REL-06, QUAL-02, REL-18 | `src/app/(client)/account/actions.ts:35-45,74-78`; `src/lib/profile.ts:50-69`; `src/app/(client)/welcome/actions.ts:30-44`; `src/lib/auth-flow.ts:91-103`; `src/lib/recurring.ts:114`; `src/lib/booking.ts:80-95,135-146,244-256`; `src/app/(client)/login/actions.ts:138-141` | **Erasure and health:** "Account deleted" can show while the data remains. Health is marked answered when nothing was stored, so no doctor's-note flag shows (a safety issue). **Other writes:** consents can go missing; weekly rules can be wiped with nothing new saved; the new password may not be saved; and `pay!.id` can hit null after the spot is taken. About 36 `x!` uses sit right after Supabase calls. | Add a `must(res)` helper on every write. Make multi-step saves atomic SQL functions: `save_health_answers` (sets `parq_completed_at` last, in the same transaction), `onboard_profile` and `replace_recurring_rules`. `deleteAccount` redirects to `?delete=failed` on error, `resetPassword` checks its error, and `bookSingle` reports a failed discount update. | FN |
| A-020 | No error boundaries; a thrown action or dropped connection shows Next's unbranded "Application error" | High (REL-20 Low folded in) | REL-07, REL-20 | No `error.tsx`, `global-error.tsx` or `not-found.tsx` in `src/app`; `src/app/(client)/book/[id]/BookActions.tsx:39-45,51-54,66-69,124-128`; `src/app/(client)/bookings/CancelButton.tsx:26-29` | The UI only handles `{ok:false}`. A lost response on a phone kills the page with no hint that the booking may exist. A retry shows "already booked" as an error. | Add `src/app/global-error.tsx`, `(client)/error.tsx`, `admin/error.tsx` and `not-found.tsx` (branded, `reset()`, link to My classes). Wrap actions in try/catch: "We lost the connection. Check My classes before trying again." plus `router.refresh()`. Treat `already_booked`, and `not_cancellable` on an already-cancelled booking, as success. | FN |
| A-021 | Two Supabase Auth round trips before any data on every signed-in request | High | PERF-02 | `src/proxy.ts:20`; `src/lib/auth.ts:13` | The proxy `getUser()`, then `getViewer` `getUser()`, then the profile, run one after another: 3 round trips. Prefetches pay them too. | `getViewer` uses `auth.getClaims()`, which is a local JWKS check with asymmetric keys. The proxy skips the refresh for `Next-Router-Prefetch` and when the token isn't near expiry. Start the profile query alongside the first-stage queries. | FN+O. Owner: enable asymmetric JWT signing keys in both Supabase projects. Without them, `getClaims` still works but falls back to a network call. |
| A-022 | Class page (`/book/[id]`) is a 13–14-step waterfall of 19 queries | High | PERF-03 | `src/app/(client)/book/[id]/page.tsx:30-131` | It's the Instagram landing page. Server time is 1,276 ms signed in and 772 ms anonymous at 90 ms round-trip time. | Three stages: (1) viewer, settings, texts, labels and the session joined with its type (`private`, `credit_cost`, `credit_kind`); (2) one-session availability; (3) one `Promise.all` for the booking, entry, `usable_credits`, `is_closed_on`, products, `trial_eligible`, unpaid, requested, freezes, balance and rewards. | FN |
| A-023 | `<Link>` prefetch storm: 12–30 server renders per page view | High (PERF-11 Low folded in: TBT is mostly prefetch and hydration contention) | PERF-04, PERF-11 | `src/components/Footer.tsx:19,33`; `src/components/DayStrip.tsx:21`; Bubbles pills; ClassRow; `/bookings` package cards | Lighthouse saw 21, 30, 23 and 12 `_rsc` prefetches. Each runs the proxy and the layout (1–3 Supabase calls) on mobile data, and the results are thrown away without `staleTimes`. | `prefetch={false}` on the Footer and legal links, Bubbles, DayStrip days and the `/bookings` package cards. Keep prefetch on BottomNav. Set `experimental.staleTimes.dynamic = 30`. | FN |
| A-024 | Client copy contradicts the settings and the engine ("No password needed", "4 weeks", "1 credit used", waitlist promise) | High (UX-14 Medium, BOOK-18 Low folded in) | QUAL-05, UX-01, UX-14, BOOK-18 | `src/app/(client)/book/[id]/page.tsx:204,219,225`; `src/lib/errors.ts:17`; `src/lib/booking.ts:67,364,403` | **Sign-in:** "Sign in with your email to book. No password needed." is wrong, and the button goes to `/login`, not `/signup`. **Copy:** "Classes open 4 weeks ahead" ignores the setting; "1 credit used" ignores `credit_cost`; the waitlist promises a package credit to people without one; and the studio alert says "went back into their package" for trials and drop-ins. | **Sign-in:** "New here? Create an account in a minute. Already a client? Sign in." with the primary link to `/signup?next=` and a text link to `/login?next=`. **Errors:** pass the window to `friendlyError`, and say "N classes from your package used". **Waitlist:** branch on `creditCount > 0` ("we'll book you in with one of your package classes" vs "we'll hold it for you and email you"). **Studio alert:** wording per `paid_with`. | FN |
| A-025 | Raw `credit_kind` keys in client emails and admin messages; receipts print "Mat" for every non-Reformer kind | High (LEGAL-16 Low folded in) | QUAL-04, LEGAL-16 | `src/lib/booking.ts:309,497,515`; `src/app/admin/actions.ts:328`; `src/lib/client-history.ts:67`; `src/app/(client)/receipts/[id]/page.tsx:28-31,46-49` | Messages read like "2 prenatal_reformer classes expire…", and Pre & Post Natal and Private receipts say "Mat". This breaks the "labels via `kinds.ts` everywhere" rule and makes receipts inaccurate. | `kindLabel()`/`kindLabels()` (once per tick) everywhere; receipts use `labelOf`. Add "Not a tax invoice. No VAT charged: the seller is not VAT-registered." while `!vat_registered`, and always show the trader name and address. Add a grep check that `credit_kind` is never interpolated into copy. | FN |
| A-026 | Requesting a package while signed out throws away the choice | High | UX-03 | `src/app/(client)/packs/PackagePicker.tsx:132-137`; `src/app/(client)/packs/page.tsx:80` | Pick, tick the terms, tap Request: the app jumps to `/login?next=/packs`, the selection is lost and nothing is explained. | When signed out, replace the terms and Request with "Create a free account to request this package" → `/signup?next=/packs?type=<tab>&pick=<id>`, pre-select `pick` on return, and show "Sign in or create an account to request your package" with `?why=package`. | FN |
| A-027 | Choosing a package shows no visible result: the request form appears about 1.5 screens below | High | UX-04 | `src/app/(client)/packs/PackagePicker.tsx:73-74` | The summary's top is at 986px on an 844px viewport, and `aria-live` is mounted at the same moment, so nothing is announced. | Scroll the summary into view (`behavior` follows reduced motion) and focus its heading (`tabIndex=-1`). Use an always-mounted live region: "8 Reformer classes, €130 selected". | FN |
| A-028 | Late-cancel warning always says "closed 1 min ago" | High | UX-05 | `src/app/(client)/bookings/page.tsx:133`; `src/lib/time.ts:55-61` | `relativeHours()` clamps negative minutes to 1, so the policy message misstates when the window closed, which invites disputes. | "Free cancellation closed at {time(start − cutoff)} (6 hours before class)." Or handle past times in the helper. | FN |
| A-029 | Trial or drop-in confirmation says nothing about paying | High | UX-06 | `src/app/(client)/bookings/[id]/confirmed/page.tsx:35-44` | The client owes €25 by Revolut before class, but the celebration page omits the amount, the method and the `RF-` reference. | When `paid_with='pay_at_studio'` and the payment is pending, show "To pay before class: €25 by Revolut · reference RF-XXXXXX" plus the Revolut button if a link is set. Reuse `<AwaitingPayment>`. | FN |
| A-030 | Mark as paid: four 40px buttons, one tap, irreversible, no confirm | High | UX-07 | `src/app/admin/PaymentButtons.tsx:5,18-22`; `src/app/admin/page.tsx:83-86` | Cash, Revolut, Bank and Card sit 6px apart next to Remove. One tap grants credits and writes the ledger, and the result is a tiny "Paid ✓". | `min-h-11 min-w-11 gap-2`. A primary "Paid · <chosen method>" with "Other method ▾". A confirm step: "Mark Maria's €25 Reformer trial as paid by Revolut?". Remove gets a 44px target. | FN |

### 3.3 Medium

| ID | Finding | Sev | Sources | Location | Problem | Fix | Disp. |
|---|---|---|---|---|---|---|---|
| A-031 | Studio-cancelled paid event: the cash payment becomes "needs_refund (Stripe)", and the email says "your class is back in your account" | Medium | BOOK-10 | `return_credit` (`20261011000800_studio_policy.sql:200`); `src/app/admin/page.tsx:70`; `src/lib/notifications/templates.ts:113` | There's no outcome for events, and the copy contradicts both the result and the payment method. | Code: a provider-neutral banner ("refund or credit by hand"); the `class_cancelled` note per `paid_with` ("class back in your package" / "nothing to pay" / "we'll be in touch about your payment"). | FN+E. Elysia: when the studio cancels a *paid event*, does the client get their money back or a credit? The legal default is a full refund (A-012). |
| A-032 | Waitlist auto-book and weekly repeats inside the 6h window send emails promising a cancel time that has already passed | Medium | BOOK-08 | `process_waitlist` (`20261025001900_round4.sql:43`); `src/lib/recurring.ts:66`; `src/lib/booking.ts:41-45,357-366` | Booking inside 6h follows her rule, but the email says "Free cancellation until 14:00" at 15:00. | When `cancelBy ≤ now`, the email says "This class is inside the 6-hour window, so it can't be cancelled for a refund." The weekly email flags such classes. | FN+E. Elysia: should "same days every week" *skip* classes already inside 6 hours when they're booked (for example right after Mark as paid), or book them and warn? |
| A-033 | A late cancel stays forfeited when the studio later cancels that class | Medium | BOOK-09 | `cancel_session` (`20261011000200_functions.sql:354`, handles only `confirmed`/`held`) | The class never happens, but the credit isn't returned. "Studio-cancelled classes are always replaced" arguably covers it. | If yes: `cancel_session` also sets `late_cancelled` → `studio_cancelled` plus `return_credit(…,'studio_cancel')`. | E. Elysia: if a client late-cancels and *then* the studio cancels that class, does the client get the class back? |
| A-034 | Double-tapping "Request package" creates duplicate pending payments, and every later tap adds another | Medium | BOOK-05 | `src/lib/booking.ts:195-209` | Select-then-insert with `.maybeSingle()` fails on 2 rows, which then lets everything through. The result is duplicate Today rows and possibly two packages granted. | A partial unique index on `payments(profile_id, product_id) where status='pending' and provider='offline' and booking_id is null`; catch `23505` and re-select; `.limit(1)`. | FN |
| A-035 | A booking window over 17 weeks can't be saved, although the form allows 26 | Medium | BOOK-06 | `20261024000100_client_feedback_1.sql:36` (check 7..120); `src/app/admin/actions.ts:563` | 18–26 weeks fails the whole settings save with "Some values are out of range". | New migration: `check (booking_window_days between 7 and 182)`. | FN |
| A-036 | Packages with more than 366 days' validity can be created, but Mark as paid then fails | Medium | BOOK-07 | `src/app/admin/actions.ts:743,777`; `credit_lots_validity_days_check`; `admin_adjust_lot` (`20261025001900_round4.sql:184`) | `grant_lot` violates the check and the payment rolls back, so she can't record money she has received. Extend or freeze past 366 gives a generic error. | Cap the product forms at 366; map the check error in `admin_adjust_lot` to `bad_days`. | FN |
| A-037 | Shared-code `max_uses` can be exceeded under concurrency; a failed discount update is ignored | Medium (SEC-15 Low folded in) | BOOK-11, SEC-15 | `src/lib/rewards.ts:15-35`; `src/lib/booking.ts:136-142,196-209` | Count-then-insert lets N+1 clients use a code limited to N. In `bookSingle` the discount update can fail silently after "code valid". | A `use_code(code, profile, payment)` SQL function with the `discount_codes` row locked `FOR UPDATE` that re-counts and attaches. Surface failures to the client. | FN |
| A-038 | Steps after `confirm_payment` (reward classes, emails) and closure loops run outside the transaction, so partial failures report the wrong outcome | Medium (BOOK-17 Low folded in) | BOOK-17, REL-10 | `src/lib/booking.ts:294-333`; `src/app/admin/actions.ts:398-407` (`markPaid`), `:461-471` (`cancelToday`), `:497-508` (`confirmClosure`) | Reward free classes are lost for good if the follow-up fails, since a retry returns `already_paid`. She sees "Something went wrong" after the payment was recorded. A throw mid-closure leaves classes half-cancelled and no freeze. | Grant reward classes inside `confirm_payment`. `markPaid` returns `ok:true` with a warning once paid. Add a `confirm_closure()` / `cancel_sessions()` SQL function that cancels and freezes in one transaction and returns the people to notify, then notify through `after()`. | FN |
| A-039 | Editing a booked class's date or type doesn't re-check packages, closures or capacity | Medium (BOOK-12 Low folded in) | BOOK-12, QUAL-09 | `src/app/admin/actions.ts:158-172` (no trigger on `starts_at`) | A moved first class leaves `expires_at` stale. A type change moves the credit kind. The capacity check counts only `confirmed` and isn't atomic. | Refuse type changes when bookings exist. On a date move, `recalc_lot_expiry` for the debited lots and refuse closed days. Check capacity in SQL with `spots_taken` under `FOR UPDATE`. Show her "N clients are booked: let them know" (no new email template). | FN |
| A-040 | Mock checkout: can grant classes for free if payments are ever switched on without keys, and can cancel event bookings in production today | Medium | SEC-02, SEC-03 | `src/app/(client)/checkout/mock/actions.ts:8-29`; `src/lib/env.ts:27`; `src/lib/booking.ts:72-104,241-291` | `completeMockPayment` isn't limited to demo. `abandonMockPayment` calls `cancel_booking` for any of the viewer's payments, which skips the events-can't-cancel guard, the rate limit, the alert and the waitlist. | Both actions only when `env.demoMode && provider==='mock' && status==='pending'`. Abandon goes through `cancelBooking()`. `paymentProvider()` never returns mock in production. `saveSettings` refuses `online_payments_enabled` unless `paymentsLive()`. | FN |
| A-041 | Anon can read clients-only event details, private sessions and all of `studio_settings`; anon queries on some tables error | Medium (SEC-10, SEC-12 Low folded in) | SEC-04, SEC-10, SEC-12 | RLS `public read sessions` and `public read settings` (`using (true)`); policies calling `is_admin()` | Verified with curl: the full Brunch & Pilates event, plus `alert_email`, IBAN fields and heartbeats. `class_types` and `products` give "permission denied for function is_admin". | Restrict sessions to `not clients_only or can_access_event(my_profile_id(), id) or is_admin()` (and hide private sessions), or use a public view with safe columns and revoke base `select`. Add a public settings view (name, intro, banner, Instagram, contact) and revoke the table. Grant execute on `is_admin` and `my_profile_id` to anon. The server uses the service role, so the app is unaffected. | FN |
| A-042 | Payments CSV is open to formula injection through client-set names | Medium | SEC-05 | `src/app/admin/export/payments/route.ts:13-18`; `src/lib/profile.ts:9` | A name like `=HYPERLINK(…)` runs in her accountant's Excel. | `esc()` prefixes `'` to values starting with `= + - @ \t \r`. Optionally tighten `nameSchema`. | FN |
| A-043 | No Content-Security-Policy | Medium | SEC-06 | `next.config.ts:3-9` | There's no second line of defence for the admin-editable texts and the email preview, and `form-action` is unrestricted. | Add `default-src 'self'`; `img-src 'self' data: https://<ref>.supabase.co`; nonce `script-src` via `proxy.ts`; `style-src 'self' 'unsafe-inline'`; `form-action 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`. Start in Report-Only. | FN |
| A-044 | Anyone can make the studio's domain email codes, and create auth users, for arbitrary addresses | Medium | SEC-07 | `src/app/(client)/login/actions.ts:46-51,94-100`; `src/lib/auth-flow.ts:28-62` | `resendCode` with any email creates a user (magiclink falls back to sign-up) and emails a code. The per-IP and per-email caps don't bound the total, which risks the sender reputation. | Send `verify_email` only to existing, unconfirmed users with `user_metadata.signup`, and use `generateLink` only for existing users. Add a global hourly cap (about 200/h) that alerts the studio. | FN |
| A-045 | OTP brute-force protection depends on hosted settings; email says 10 minutes but the code lasts 60; the limiter fails open | Medium | SEC-08 | `src/app/(client)/login/actions.ts:28-31,78-81,120-121`; `supabase/config.toml:233-235`; `src/lib/notifications/templates.ts:53,60,67`; `src/lib/rate-limit.ts:12-14` | The `/auth/v1/verify` endpoint is reachable directly with only GoTrue's per-IP limit. | Code: fail closed for the `signin` and `code` kinds; `config.toml` `otp_expiry=600`; email copy matches the configured lifetime. | FN+O. Owner: hosted OTP expiry 600 s (length 8 is optional: the app accepts 6–10 digits) and a lower `token_verifications` rate limit on both projects. |
| A-046 | The "Your classes expire on …" email names the day after the last valid day | Medium | TIME-01 | `src/lib/booking.ts:497` | `spokenDateTime(expires_at)` formats the local midnight that starts the first invalid day. | `longDate(lastDay(expires_at))`, worded "can be used until …". | FN |
| A-047 | Extending or freezing a fixed-end package across DST moves the end off local midnight | Medium | TIME-02 | `admin_adjust_lot` freeze/extend (`20261025001900_round4.sql`); `admin_adjust_credits`, `return_credit`, `resume_membership` | `expires_at + N days` is 24h steps in a UTC session. Across spring-forward the card shows one extra day, which is then refused. | `(((expires_at at time zone tz)::date + n)::timestamp at time zone tz)`, or `set timezone='Europe/Nicosia'` on these functions. | FN |
| A-048 | Client import parses `credits_expire` as a UTC instant, and non-ISO dates silently mean "never expires" | Medium | TIME-03 | `src/app/admin/actions.ts:856` | `2026-12-31` → 02:00 local, so classes that day are refused. `31.12.2026` → NaN → no expiry. | Accept `YYYY-MM-DD`, `DD.MM.YYYY` and `DD/MM/YYYY`, convert with `localToUtc(addDaysKey(day,1),"00:00")`, and skip unparseable rows with a message. | FN |
| A-049 | `runTick` makes about 135 sequential calls, redoing every reminder each run; N+1 loops elsewhere | Medium (QUAL-19 Low folded in) | PERF-06, QUAL-19 | `src/lib/booking.ts:353-371,437-461,471-531`; `src/lib/recurring.ts:79-89`; `src/lib/tick.ts:9-16`; `src/lib/rewards.ts:45`; `src/lib/data.ts:37`; `src/app/admin/actions.ts:844-860` | The tick takes 11 s at 90 ms round-trip time. Dedupe only happens on insert, `getSettings` runs 20×, and an import can hit the Hobby timeout. | A `due_reminders(offset)` RPC that anti-joins `notifications.dedupe_key`. Batch profile reads with `.in`. Pass settings down. Run notifications with concurrency 5. Keep the page-view tick fallback (Decision), but only when the heartbeat is older than 10 min. Chunk the import. | FN |
| A-050 | PostgREST's 1,000-row cap silently truncates: Events, first-class flags, CSV, year stats, clients list, tick scans | Medium | PERF-07, REL-11 | `src/app/(client)/events/page.tsx:22`; `src/lib/admin-data.ts:22-24`; `src/app/admin/export/payments/route.ts:10`; `src/app/admin/stats/page.tsx:67-72`; `src/app/admin/clients/page.tsx:16`; `src/app/admin/classes/[id]/page.tsx:29`; `src/lib/booking.ts:441-447,503-504`; `src/lib/recurring.ts:115-117`; `supabase/config.toml:18` | Her 32-class timetable is about 1,660 sessions a year, so events after about 7 months vanish. Wrong "First class" flags, a truncated accountant CSV, an understated payments-by-method total and missed low-credit lots all happen silently. | Events-only availability (`p_kind` or an `events` RPC). `first_class_at(uuid[])`. `payments_by_method(year)`. CSV paged with `.range()`. Clients search and paging. Low-credit check in SQL. | FN |
| A-051 | Unbounded "everything for this client" queries | Medium | PERF-08 | `src/lib/packages.ts:21-31`; `src/lib/client-history.ts:46-50`; `src/lib/media.ts:17-21`; `src/lib/data.ts:31-38`; `src/lib/rewards.ts:41-52` | Cost grows linearly with history, and the queries are truncated past 1,000 rows. | Last 12 past packages with "show all". Per-lot counts in SQL. Archive media `.in(slot, …)`. A `locked_events(profile, ids[])` RPC. Grouped reward-use count. | FN |
| A-052 | Her photos are full-size originals in raw `<img>`, the first one is lazy, and the uploaded logo is unoptimised | Medium | PERF-09 | `src/components/PhotoStrip.tsx:12`; `src/components/EventCard.tsx:15,40`; `src/components/Logo.tsx:14`; `next.config.ts`; `src/app/admin/photos/Uploader.tsx:8-16` | 250–450 KB at 1,600px are shown at 176–360 CSS px, and the LCP image is lazy-loaded. | `images.remotePatterns` for Storage plus `next/image` with `sizes`. `priority` on the first slide or cover. Drop `unoptimized`. Also store a 640px variant at upload (keeps within the Hobby image quota). | FN |
| A-053 | No page can be cached; content pages run the proxy, layout and DB on every hit | Medium | PERF-10 | `src/app/(client)/layout.tsx:7`; `force-dynamic` everywhere | An architectural change, and `cacheComponents` is deliberately off (Decision). | See §6. | OOS (v2) |
| A-054 | Admin writes ignore errors (`saveTimetable` can wipe future classes while saying "Saved"), and the error contract is inconsistent | Medium | REL-08, QUAL-10 | `src/app/admin/actions.ts:21,28-47,174-179,206,214-218,228,421,479,512,624-677,799-809,850-859,907-930`; `src/app/admin/photos/actions.ts:43-60`; `src/lib/booking.ts:415` | A failed slot insert still runs `replace_timetable_from`, which deletes the empty future classes. Attendance, doctor's note, student price and team role can silently not change. Some actions throw, some swallow errors, and there are two error maps. | A `save_timetable(name, from, slots jsonb)` SQL function (all or nothing). Every exported action returns `ActionResult`. `admin()` throws if the audit insert fails and wraps lib throws. Merge `LOT_ERRORS` into `errors.ts`, add messages for `online_payments_off`, `bad_mode`, `bad_action` and `name_required`, and test that every `raise exception` code has a message. | FN |
| A-055 | Transient DB errors become crashes or sign-outs (`data!`, `getViewer` returns null) | Medium | REL-09 | `src/lib/auth.ts:11-35,57-58`; `src/lib/booking.ts:44-47` | A brief hiccup logs the client or the studio out, or throws a TypeError. | `getSettings` and `profileById` throw `db_unavailable` (handled by the A-020 boundaries). `getViewer` separates "no user" from a DB error and never redirects on the latter. One retry with jitter for idempotent GETs in `db()`. | FN |
| A-056 | No error monitoring; logs can contain personal data | Medium | REL-12 | `src/lib/notifications/index.ts:51`; `src/lib/auth-flow.ts:227`; `src/app/(client)/login/actions.ts:180`; `src/lib/tick.ts:7`; `src/lib/booking.ts:92,331` | Failures reach only Vercel logs (1h on Hobby), and nobody watches them. | Log codes and ids, not provider bodies (sanitiser). A daily tick step emails the developer when failed Outbox rows exist or no tick has succeeded in 30 min. `/api/health` returns the tick age for an uptime check. | FN+O. Owner: who gets the alert email, and whether to add Sentry (free, EU region, `sendDefaultPii:false`). |
| A-057 | Config isn't validated; a missing `NEXT_PUBLIC_SITE_URL` gives wrong email links and no scheduler | Medium | REL-13, QUAL-11 | `src/lib/env.ts:3-6,24`; `src/proxy.ts:7`; `scripts/migrate.mjs:62-69` | Missing keys show up as runtime 500s. Email links fall back to the `VERCEL_URL` preview host. The cron job silently isn't created. `DEMO_ADMIN_CODE` strips letters silently. | A Zod env schema, checked lazily, in `instrumentation.ts` `register()` and in `migrate.mjs`. With `APP_ENV=production`, require the site URL (https), `CRON_SECRET` (≥32), the Supabase keys, `RESEND_API_KEY` and `EMAIL_FROM`, and exit non-zero on failure. Stripe and Twilio are all-or-none groups. | FN+O. Owner: confirm these vars are set on `reform-studio` before the next deploy, since the build will now fail without them. |
| A-058 | Migrations commit before `next build`, with no lock against concurrent deploys | Medium | REL-14 | `package.json` `vercel-build`; `scripts/migrate.mjs:30-39` | A failed build leaves old code on a new schema, and parallel builds race. | Take `pg_advisory_lock(hashtext('app_migrations'))` in `migrate.mjs`. Add an expand/contract rule to CLAUDE.md Decisions; keep the build order. | FN |
| A-059 | The studio can't erase or export a client who has no login; DM erasure requests have no path | Medium | LEGAL-06 | `src/app/admin/actions.ts:66-99,841-864`; no admin call to `erase_profile` | Art. 15, 17 and 20 apply to manually added and imported people too. | Client page → Privacy & data: "Export data (JSON)" (refactor `/api/account/export` into `src/lib/export.ts`) and "Erase this client" (type ERASE, which runs `erase_profile`, plus `deleteUser` if linked, and writes `audit_log` without personal data). Refuse while a payment is pending. | FN |
| A-060 | "Fitness declaration" is recorded as given though nothing was declared; no Health & Safety acknowledgement | Medium | LEGAL-11 | `src/lib/auth-flow.ts:99`; `src/app/(client)/welcome/actions.ts:41`; `src/lib/policy.ts:9`; `src/app/(client)/account/page.tsx:20` | A false consent record. | Stop inserting `fitness_declaration`. Add the WAIVER (legal §5) as `policy_versions` doc `waiver`. The existing single sign-up and welcome checkbox becomes "I accept the Studio Rules, the Payments & Cancellation Policy, the Terms and the Health & Safety acknowledgement", with one `consents` row per doc. Rename the Account label. | FN+O. Owner: approve the waiver wording. |
| A-061 | Birthday and reward emails are promotional but sent as service messages, ignoring the news opt-in, with no unsubscribe | Medium | LEGAL-12 | `src/app/admin/actions.ts:297-309,348-369`; `src/lib/notifications/templates.ts:188-203,236` | ePrivacy art. 13 (Cyprus 112(I)/2004 art. 106) needs consent, or a soft opt-in with an opt-out in every message. | If approved: send only when `marketing_email` is true (the reward is still saved in the app); a `kind:'marketing'` footer with a one-click HMAC unsubscribe plus `List-Unsubscribe` headers. | O. Owner: should birthday and reward emails go only to clients who ticked "news" at sign-up, with an unsubscribe link? This changes who Elysia's birthday emails reach. |
| A-062 | Under-18s: studio adds and imports have no age check; the roster "Under 18" flag contradicts 18+; the DOB check uses the UTC date and breaks on 29 Feb | Medium (TIME-06 Low folded in) | LEGAL-13, TIME-06 | `src/app/admin/actions.ts:58-99,831-864`; `src/lib/admin-data.ts:36`; `src/app/admin/page.tsx:136`; `src/lib/profile.ts:12-21` | A minor can be booked by the studio with no DOB. `yearsAgo` refuses someone who turns 18 that local day between 00:00 and 03:00, and accepts a 17-year-old on 29 Feb. | Manual add and import require "This person is 18 or over" (server-side) or a DOB through `dobSchema`. The flag fires only for manual DOBs under 18, and `book_session` refuses `minor_not_allowed`. `dobSchema` refines with `ageOn(d) >= 18` on `todayKey()`. 18+ is stated in the Terms and Privacy (A-013). | FN |
| A-063 | Data export is incomplete | Medium | LEGAL-15 | `src/app/api/account/export/route.ts:9-40` | Missing: freezes, memberships, event access, message content, studio alerts about them, payment `provider_ref`/`paid_at`/code, the audit entries that concern them, auth timestamps, and the Art. 15 information. The controller is hard-coded. | Add these selects, `auth` from `getUserById`, and an `about` block (controller from `business(s)`, purposes and retention, recipients, rights). Rate-limit with `rateLimited("export", id, 5, 60)`. Shared with A-059. | FN |
| A-064 | Business rules are implemented in both TS and SQL with different semantics | Medium | QUAL-06 | `src/app/admin/actions.ts:163-164,277`; `src/lib/booking.ts:379-382,503-517`; `src/lib/packages.ts:60-67`; `src/lib/client-history.ts:64-70`; `src/lib/time.ts:2`; `src/lib/data.ts:91` | Edit capacity counts only `confirmed`. The events-can't-cancel guard exists only in TS. There are four "active package" definitions. The low-credit check ignores freezes and expiry. Freeze days are computed in TS. The timezone setting is unused. | One owner per rule, preferably SQL: the events guard goes into `cancel_booking` (WP3 rewrite); capacity via `spots_taken` (A-039); low-credit via `usable_credits`; freeze days from the dates in SQL; one TS "active" predicate mirroring `is_studio_client`; document that `timezone` is fixed to Europe/Nicosia. | FN |
| A-065 | Settings save: empty or NaN numbers become 0 (for example a cancellation cutoff of 0) with no field-level errors | Medium | QUAL-07 | `src/app/admin/actions.ts:526-566,128,206,878` | Clearing a field silently breaks her 6h policy or expires every request on the next tick. Session price NaN or negative values are accepted. `saveTimetable` `JSON.parse` throws. | A Zod `SettingsForm` with `z.coerce.number().int().min().max()`: empty means keep the current value, and errors are per field. `priceCents()` for the session price. Guarded `JSON.parse`. Validate import capacity and honour its `to`. | FN |
| A-066 | Server actions take positional, unvalidated arguments | Medium | QUAL-08 | `src/app/(client)/book/[id]/actions.ts:73-87`; `src/app/admin/actions.ts:26,33,398,427,442,452,807` | Unknown `method` values fall through to `bookWithPayment`, ids aren't UUID-checked, and bad values reach the audit log. | A `z.object` per action (uuid ids, `z.enum` for modes and methods) through a shared `parse()` that returns `ActionResult`. | FN |
| A-067 | Test coverage gaps on critical rules | Medium | QUAL-12 | `tests/engine.test.ts` (54, `:215` fixed sleep); `e2e/*.spec.ts` (11) | Untested: private sessions, events-no-cancel, `credit_cost>1`, late-fill refund, `cancel_session` credit return, closure cancel and booking block, `applyRecurring`, reminders and opt-out, `extend_timetable` horizon, RLS, health consent, email matching. | See §4. Replace the sleep with polling. | FN |
| A-068 | No Node version pinned; critical libraries on caret ranges; unused dev deps | Medium (SEC-22 Low folded in) | QUAL-13, SEC-22 | `package.json`; `package-lock.json` | Node 22 locally, 24 on Vercel and `@types/node` 20. `@supabase/ssr ^0.12` is a 0.x line. 8 moderate dev-only `npm audit` findings (minimatch). | `"engines": {"node": "22.x"}` with matching `@types/node`. Pin `@supabase/ssr` exactly. Apply patch bumps (next 16.4.5, react 19.3.1). Add `supabase` as a devDependency. Drop the 2 `@fontsource` packages. Use `npm ci` in CI. Leave majors for v2. | FN+O. Owner: set the Node version on both Vercel projects to match. |
| A-069 | Superseded or unused SQL kept live and granted | Medium | QUAL-14 | `admin_adjust_credits` (`20261011000600`); `bookings.free_cancel_until` reads in `cancel_booking` (`20261025001700`) and `src/lib/booking.ts:359-364` | Dead functions add attack surface and stale bodies mislead reviewers. | A migration that drops `admin_adjust_credits` (update `tests/engine.test.ts:135`). Remove the dead `free_cancel_until` branches but keep the column (CLAUDE.md). Add a latest-definition index to `docs/ARCHITECTURE.md`. | FN |
| A-070 | Signed-out visitors are never told a trial exists (class page shows €35 only) | Medium (from High: information missing rather than wrong; a conversion issue) | UX-02 | `src/app/(client)/book/[id]/page.tsx:200-205` | The cheapest way in only appears after sign-up and the health questions. | In the signed-out `PriceSummary`, when the type has a trial: "First time at Re·Form? Your first Reformer class is €25 (trial)." Keep €35 labelled "Drop-in". | FN |
| A-071 | Accessible names don't contain the visible text; errors and hints aren't linked; focus is lost after errors and on health step 2 | Medium | UX-08, UX-09, UX-10 | `src/components/DayStrip.tsx:26`; `src/components/ClassRow.tsx:20,58`; `src/app/(client)/bookings/page.tsx:101`; `bookings/CancelButton.tsx:15`; `src/app/admin/classes/[id]/RosterActions.tsx:13`; `src/components/ui.tsx:69-78`; `signup/SignupForm.tsx:148`; `health/HealthWizard.tsx:32,51,99-121` | WCAG 2.5.3 failures (axe "serious"), "1 classes", unwired `{id}-hint`, no `aria-invalid` on login and account, focus on `<body>` at the page bottom, Zod's default email message, and a BP question that looks optional. | Names start with the visible words, with singular/plural. `Field` wires `aria-describedby` and `aria-invalid`. Focus the first invalid field or the error notice. Studio-voice email and policy errors. Focus "Step 2 of 2" in a live region. "(required)" on BP. "No injuries or medical conditions" first. | FN |
| A-072 | Class page: a missing DOB sends the client to Account and loses the class; the "Policies" link goes to the Studio Rules | Medium | UX-11, UX-12 | `src/app/(client)/book/[id]/page.tsx:211,249` | Dead ends, and the link misses the 6h rule. | `/account?dob=1&next=/book/<id>`, then after saving "Saved. Back to your class →". Link "Cancellation policy" to `/policy/payments` with a 44px target. | FN |
| A-073 | Copy that doesn't match behaviour: "See you on the reformer" for Mat; "email + SMS" when SMS is off; reminders "the day before" | Medium | UX-13, UX-20, UX-21 | `src/app/(client)/book/[id]/page.tsx:197`; `src/app/admin/page.tsx:162`; `src/app/(client)/account/Forms.tsx:41` | Wrong promises to clients and to the owner. | "See you on the mat." for Mat ("See you there!" for events). "tells everyone booked by email" (SMS only when live) and "returns their package classes". Notification copy built from `reminder_offsets_minutes`. | FN |
| A-074 | Cancel succeeds silently | Medium | UX-15 | `src/app/(client)/bookings/CancelButton.tsx:26-28` | The card disappears, focus is lost, and there's no word about the class or the payment request. | Redirect with a status Notice: "Cancelled. Your class is back in your package." / "Cancelled. Nothing to pay." / "Released to the waitlist." The unpaid warning becomes "Your spot will be released and you won't need to pay." | FN |
| A-075 | Bottom navigation: small labels and contrast failures when dark content scrolls under the glass | Medium | UX-16 | `src/components/BottomNav.tsx:36`; `src/app/globals.css:95-99` | 11.2px `ink-soft` text on 72% glass fails over ink buttons (axe). | Glass 0.9 (or `bg-paper/95`), labels `0.75rem text-ink`, and `main` bottom padding `calc(56px + env(safe-area-inset-bottom))`. | FN |
| A-076 | Admin tap targets under 44px; the Attendance "radiogroup" has no arrow-key behaviour or failure state | Medium | UX-17, UX-18 | `src/app/admin/Attendance.tsx:15-25`; `src/app/admin/HealthInfo.tsx:19`; `RosterActions.tsx:11,13`; `src/app/admin/classes/[id]/page.tsx:112-115`; `AdminNav.tsx:24`; `timetable/Builder.tsx:49`; `photos/Uploader.tsx:59,71` | Targets of 32–40px on her busiest screens. ARIA radio semantics without radio behaviour. Optimistic updates with no error path. | `min-h-11` / `size-11` everywhere. Native radio chips (or `aria-pressed` buttons). A "Saved" or error status after the call. | FN |
| A-077 | Manual add defaults to "Paid / settled outside the app", even for package clients | Medium | UX-19 | `src/app/admin/classes/[id]/page.tsx:112` | An unchanged default silently skips the package debit. | Default to "Use one of their package classes" when the class has a `credit_kind`, and rename the other option "Already paid (outside the app)". | FN |
| A-078 | Emails link to Account → Notifications, but the anchor sits inside a closed `<details>` and isn't its own section | Medium | UX-22 | `src/app/(client)/account/page.tsx`; `src/app/(client)/account/Forms.tsx` (`id="notifications"`) | iOS Safari may land on a collapsed card. | Make Notifications its own Accordion `id="notifications"`, opened on the hash or on `?open=notifications`, and update the email links. | FN |
| A-079 | Revolut instructions say "ask your instructor for her Revolut" | Medium | UX-23 | `src/components/AwaitingPayment.tsx:31` | Without `revolut_link` this is a dead end that pushes the client back to DMs. | Fallback copy with a `/contact` link, plus Admin Today Readiness: "Add your Revolut link". Keep the option visible. | FN+O. Owner: ask Elysia for her Revolut link and IBAN to enter in Settings. |

### 3.4 Low

| ID | Finding | Sev | Sources | Location | Problem | Fix | Disp. |
|---|---|---|---|---|---|---|---|
| A-080 | Freeze and closure on the same days extend a package twice | Low | BOOK-13 | `admin_adjust_lot('freeze')` (`20261025001900_round4.sql:184`); `compute_expiry` | The overlap is counted twice. | Add `p_days − closed_days(from, to+1)`, or count freezes and closures as one set of days. | FN |
| A-081 | Refund-if-filled returns the credit even when the class still had free spots | Low | BOOK-14 | `apply_late_fill_refund` (`20261011000200_functions.sql:79`); end of `book_session` | Any later booking refunds the late canceller. The setting is off by default. | Refund only when the newcomer took a spot that wouldn't otherwise exist (`spots_taken ≥ capacity − pending late refunds`). | FN |
| A-082 | Joining the waitlist ignores the booking window | Low | BOOK-15 | `join_waitlist` (`20261011000200_functions.sql:227`) | A queued client beyond the window gets an offer they can't book, which blocks the spot. | Same `beyond_window` check as `book_session`. | FN |
| A-083 | No-show and attendance edits on future bookings free spots silently and can exceed capacity | Low | BOOK-16 | `src/app/admin/actions.ts:33-49` | No started-class check and no waitlist advance. | Allow only when `starts_at <= now()`; otherwise point to Remove (`cancelBooking`). | FN |
| A-084 | Demo seed still makes an 8-spot Mat class; baseline Mat default is 8 | Low | BOOK-19 | `seed_demo` (`20261025001700_studio_notes_2.sql`); `install_baseline`/`install_catalogue` | Contradicts Mat = 4 (her answer, 3 Nov). Production is unaffected. | A migration redefining `seed_demo` and the baseline defaults with 4. | FN |
| A-085 | Studio "Remove client" always refunds, even inside 6h | Low | BOOK-20 | `cancel_booking` `p_admin=true` (`20261025001700_studio_notes_2.sql:71`); `adminCancelBooking` | She can't apply the late-cancel policy to someone who DMs 2h before class. | If yes: two choices, "Remove: return the class" and "Remove: late cancel (no class back)". | E. Elysia: when you remove someone inside 6 hours, do you want the option to treat it as a late cancel (class not returned)? |
| A-086 | TRUNCATE, TRIGGER and REFERENCES (and DML on 4 tables) granted to anon and authenticated | Low (LEGAL-18 Low) | SEC-11, LEGAL-18 | `information_schema.role_table_grants` (all public tables) | Not reachable through PostgREST, but TRUNCATE bypasses RLS and the ledger trigger. | `revoke truncate, trigger, references on all tables in schema public from anon, authenticated` plus `alter default privileges`. Revoke insert, update and delete on `health_notes`, `health_history`, `consents`, `compliance_items`, `template_slots` and `timetable_templates`. Add a `before truncate` trigger on `credit_ledger`. | FN |
| A-087 | Account enumeration through sign-up and sign-in messages | Low | SEC-13 | `src/app/(client)/login/actions.ts:46-51,62-66,139-145` | Rate-limited (10/email, 50/IP per 15 min). | Accept the trade-off (clear messages for clients) and record it in CLAUDE.md Decisions. No behaviour change. | FN |
| A-088 | Re-running sign-up overwrites an unconfirmed account's details | Low | SEC-14 | `src/app/(client)/login/actions.ts:84-88,146-149` | The attacker's name and phone end up in the real owner's profile at confirmation, and phone drives trial eligibility. | Onboard only from details bound to the same browser (a signed httpOnly cookie or a hash in the metadata); otherwise ask again on `/welcome`. | FN |
| A-089 | Cron secret compared without constant time | Low | SEC-16 | `src/app/api/cron/tick/route.ts:8` | | `crypto.timingSafeEqual` on equal-length buffers. | FN |
| A-090 | ICS: `;` not escaped, CR not stripped, no line folding, no SEQUENCE | Low | SEC-17, TIME-07 | `src/lib/ics.ts:3,5-27` | `"\;"` in JS is `";"`. | `.replace(/;/g,"\\;")`, strip `\r`, fold at 75 octets, `SEQUENCE` from `updated_at`, `STATUS:CANCELLED` when cancelled. | FN |
| A-091 | Admin client search builds a PostgREST `or` filter from raw text | Low | SEC-18, QUAL-18 | `src/app/admin/clients/page.tsx:18` | Commas and parentheses break or extend the filter. | Strip `,()*%\` or quote the term (and use paging from A-050). | FN |
| A-092 | Client IP taken from the first `x-forwarded-for` value, in two duplicated helpers | Low | SEC-19 | `src/lib/rate-limit.ts:18-21`; `src/lib/auth-flow.ts:30-31` | Spoofable outside Vercel. | One `clientIp()` that prefers `x-real-ip` / `x-vercel-forwarded-for`, with the assumption documented. | FN |
| A-093 | Upload type trusted from the browser's MIME type | Low | SEC-20 | `src/app/admin/photos/actions.ts:30-34` | Admin-only; the bucket limits jpeg/png/webp to 5 MB. | Check magic bytes (FF D8 FF / 89 50 4E 47 / RIFF…WEBP). | FN |
| A-094 | Server Actions body limit raised to 6 MB for every action | Low | SEC-21 | `next.config.ts:16` | The per-IP auth limits already cover the risk. | Keep it and document why (photo upload). Moving the upload to a route handler is optional and not in this pass. | FN |
| A-095 | `localToUtc` is wrong for 01:00–03:59 on both DST Sundays | Low | TIME-04 | `src/lib/time.ts:65-74` | No classes run at those hours, and midnight is correct. | Iterate the offset twice. A gap → the next valid time; an overlap → the first occurrence. The timetable editor refuses 03:00–03:59 on transition days. | FN |
| A-096 | Closure ledger note says "+2 days" for a 3-day extension across spring-forward | Low | TIME-05 | `apply_closure` (`20261011000800_studio_policy.sql`) | The expiry is right, but the accountant note is wrong. | Count with local `date` subtraction. | FN |
| A-097 | The 24h reminder says "Tomorrow" whatever the offset or delivery time | Low | TIME-08 | `src/lib/booking.ts:454`; `src/lib/notifications/templates.ts:80-84` | Wrong with a 12h or 48h offset, or after an outage. | Pick "Today", "Tomorrow" or the weekday from `dayKey(class)` vs `dayKey(now)`. | FN |
| A-098 | Server UTC year used for the footer ©, the CSV default year and the CSV year boundaries | Low | TIME-09, REL-19 | `src/components/Footer.tsx:35`; `src/app/admin/export/payments/route.ts:9-11` | Wrong between 00:00 and 02:00 Nicosia on 1 Jan. | `todayKey().slice(0,4)` and `localToUtc(\`${y}-01-01\`,"00:00")`. | FN |
| A-099 | Minor time inconsistencies | Low | TIME-10 | `src/app/(client)/book/[id]/page.tsx:127,193`; `generate_sessions_range` | The class page checks unpaid against `starts_at` while the engine uses `ends_at`. The window opens by clock time. Slots in the DST gap shift. | Align the unpaid check to `ends_at`. Optionally show "opens on … at 08:00". Gap slots are refused by A-095. | FN |
| A-100 | Small sequential awaits on Home, Schedule, Packs, My classes and Admin Today | Low | PERF-12, PERF-13 | `src/app/(client)/page.tsx:25-45`; `schedule/page.tsx:22-24`; `packs/page.tsx:26`; `bookings/page.tsx:20-21`; `src/lib/data.ts:13-16`; `src/app/admin/page.tsx:31-46` | 1–3 extra round trips per page. | Fold them into the first `Promise.all`. Add `ct.private` to the `session_availability` output. Today uses `first_class_at` (A-050). | FN |
| A-101 | `nextBooking` can show the wrong "Your next class" | Low | PERF-14 | `src/lib/data.ts:72-80` | `referencedTable` ordering doesn't order the bookings, and `.limit(10)` is arbitrary. | Order by a bookings-level column, or use an RPC. | FN |
| A-102 | Unpaid-request and offer expiry depend on the scheduler; the Today warning is hidden when cron has never run | Low | REL-16, REL-17 | `scripts/migrate.mjs:62-86`; `src/lib/booking.ts:479-489`; `src/app/admin/page.tsx:63` | A null `last_cron_tick_at` shows no warning. | Warn when it's null too (outside demo). The build-time requirement is A-057. | FN |
| A-103 | Rate-limit hashes are unsalted SHA-256 of email and IP; `otp_requests` is never purged | Low | LEGAL-14 | `src/lib/rate-limit.ts:8`; `src/lib/auth-flow.ts:11,29-40` | Reversible, so they are personal data. | HMAC with `RATE_LIMIT_SECRET` (fallback `CRON_SECRET`). Purge `otp_requests` older than 1 day (also in A-011). | FN |
| A-104 | No accessibility statement | Low | LEGAL-17 | (none) | The studio is exempt from the EAA as a micro-enterprise, but it's good practice. | `/legal/accessibility` (WCAG 2.2 AA aim, contact for an accessible alternative, review date, micro-enterprise note), linked in the footer. | FN |
| A-105 | Health form edge case: "No injuries" plus text in "other medication" can't be saved | Low | LEGAL-19 | `src/lib/profile.ts:48`; `src/app/(client)/health/HealthWizard.tsx:132` | The server requires consent but the box is hidden. | One `needsHealthConsent()` in `src/lib/health.ts`, used by client and server. | FN |
| A-106 | Dead code, files and routes | Low | QUAL-15 | `src/components/ClickToLoadMap.tsx`; `src/lib/parq.ts`; `src/lib/data.ts:85`; `src/lib/recurring.ts:16,30`; `src/lib/time.ts:18,51`; `src/lib/media.ts:11`; `src/app/admin/ui.tsx:30`; `src/app/admin/HealthInfo.tsx:12`; `src/lib/booking.ts:260-267`; `src/app/(client)/login/actions.ts:188`; `src/app/(client)/magic/page.tsx`; `.live.mjs`; `docs/guides/guide.css` | `/magic` is still routable. The map component is unused while the docs and Cookies page claim a map. | Delete the unused exports and files (keep `viva.ts` and the membership code). Make `/magic` `notFound()`. Remove the map claims (A-013), or delete the component. Check `.live.mjs` and `guide.css` usage before deleting. Add knip to CI. | FN |
| A-107 | Type escape hatches | Low | QUAL-16 | `src/app/admin/actions.ts:284,593,647`; `src/lib/booking.ts:328,480-481`; `src/app/(client)/book/[id]/page.tsx:99` | `as never` and `null as unknown as string` hide errors. | Regenerate types (`class_kind` has `other`). `widen-types.mjs` marks nullable RPC args as nullable. `creditBalance` returns `{totals, expiry}`. | FN |
| A-108 | Naming and consistency: "credit" in client copy, "parq" names, inline date helpers, duplicated `tmpl`, `months` and `euro` | Low | QUAL-17 | `src/lib/booking.ts:61,67,260-265,309,392,454,497,526`; `src/lib/errors.ts:14`; `templates.ts:123`; `src/app/admin/actions.ts:92-94,328,362,572`; `src/lib/recurring.ts:1,91`; `src/lib/discount.ts:15` | Copy drift and maintenance traps. | A credit → class copy pass. Use `longDate`, `lastDay` and `dotDate`. Export `tmpl`. Share `months`, `clientIp` (A-092) and `eur`. Alias `parq_completed_at` as `healthAnsweredAt` in TS. Fix the import order. | FN |
| A-109 | Copy and layout polish on Packages, My classes, payments and Home | Low | UX-24, UX-25, UX-26, UX-27, UX-29, UX-32, UX-33, UX-34, UX-36 | `src/app/(client)/packs/page.tsx:43,97`; `PackagePicker.tsx:45-46,57,123,132`; `src/app/(client)/bookings/page.tsx:41,146`; `AwaitingPayment`; `src/components/Footer.tsx`; `book/[id]/BookActions.tsx:140-141`; `src/app/admin/HealthInfo.tsx`; `src/app/(client)/page.tsx`; `src/components/ui.tsx:96` | Two identical card titles and "N credits". Three labels on My classes. Mixed date formats. "No sessions booked". Small inline links. Both buttons read "Reserving…". "Request package" disabled with no reason given. "Earlier PAR-Q". The pill wraps and the heading baseline is off. | Card titles "1 month · valid 30 days from your first class"; drop the credits line. One subtitle "Your packages and upcoming classes". `longDate` for dates. "No classes booked". `inline-flex min-h-11` links. A pending label per mode. Enabled button with an inline error and focus. "Earlier health questions, answered yes:". Shorter pill and `items-baseline`. | FN |
| A-110 | Semantics: privacy table overflows at 320px; demo banner outside landmarks; static class page `<title>`; icon-only `<dt>` | Low | UX-28, UX-30, UX-31, UX-35 | `src/app/(client)/legal/[slug]/page.tsx`; `src/components/Header.tsx`; `src/app/(client)/book/[id]/page.tsx:23,158-163` | | Scrollable region wrapper; banner inside `<header>` with `role="note"`; `generateMetadata` ("Reformer Pilates · Fri 6 Nov 17:00 · Re·Form"); `sr-only` `<dt>` with the icon `aria-hidden`. | FN |

**Source-ID coverage check.** All 162 source IDs are mapped:
- SEC-01…22
- BOOK-01…20
- TIME-01…10
- PERF-01…14
- REL-01…21
- UX-01…36
- LEGAL-01…20
- QUAL-01…19

Merged groups (one row each): QUAL-01/SEC-09; REL-05/QUAL-03; REL-06/QUAL-02/REL-18; PERF-07/REL-11; QUAL-05/UX-01/UX-14/BOOK-18; LEGAL-01/02/03; REL-01/REL-21; REL-03/PERF-05/REL-15; REL-07/REL-20; PERF-04/PERF-11; QUAL-04/LEGAL-16; PERF-01/LEGAL-10; LEGAL-09/LEGAL-20; BOOK-11/SEC-15; BOOK-17/REL-10; BOOK-12/QUAL-09; SEC-02/03; SEC-04/10/12; PERF-06/QUAL-19; REL-08/QUAL-10; REL-13/QUAL-11; LEGAL-13/TIME-06; QUAL-13/SEC-22; SEC-11/LEGAL-18; SEC-17/TIME-07; SEC-18/QUAL-18; TIME-09/REL-19; PERF-12/13; REL-16/17; the UX groups. No ID is unmapped.

---

## 4. Test plan

Test locations:
- `tests/engine.test.ts`: node:test against local Supabase.
- `tests/webhook.test.ts`.
- `e2e/*.spec.ts`: Playwright on a production build.

New files proposed:
- `tests/unit.test.ts`: pure TS helpers (time, copy, templates), with no DB.
- `tests/notify.test.ts`: `notify()` and tick with a fetch stub and a `server-only` shim, the same technique as the reliability audit's `notify-fault.mts`.
- `e2e/authz.spec.ts`, `e2e/account.spec.ts`, `e2e/health.spec.ts`, `e2e/legal.spec.ts`, `e2e/resilience.spec.ts`.

Shared helpers to add to `tests/engine.test.ts`:
- `assertLedgerInvariant()` (every lot: `remaining = sum(delta)`), called at the end of every race test.
- `parallel(n, fn)`: separate connections that fire together.

### 4.1 Mandatory tests

| Mandatory test | Existing coverage | To add (file) |
|---|---|---|
| Concurrent last-spot booking | `engine.test.ts:100` "concurrent bookings never exceed capacity" | Explicit last spot: 2 parallel bookings for 1 remaining spot → exactly 1 `ok`, 1 `full`, then `assertLedgerInvariant()`. Also the online vs waitlist race after A-005 (`engine.test.ts`) |
| Double-tap booking | `engine.test.ts:91` "concurrent bookings never overspend credits" | Same client, same class, 2 parallel calls → 1 booking, 1 credit (`bookings_one_active`). Parallel trial/drop-in double-tap → 1 unpaid payment (A-004). Parallel package requests → 1 pending row (A-034, index-level insert test). All in `engine.test.ts`. UI: `e2e/resilience.spec.ts` double-click Secure → one booking |
| Cancellation exactly at the cutoff boundary | `engine.test.ts:261` (6h), `:272` (real elapsed time across DST) | Boundary inside one transaction (`now()` is constant): class at `now() + 6h − 1ms` → `late_cancelled`; at exactly `now() + 6h` → `cancelled` and credit back. Ports `booking-audit/cutoff.mjs` (`engine.test.ts`). UI copy: `tests/unit.test.ts` for A-028 (absolute "closed at" time) |
| DST-boundary reminders | none (only timetable/expiry DST: `engine.test.ts:224-242`) | `tests/unit.test.ts`: reminder wording Today/Tomorrow/weekday (A-097) for classes on 28–29 Mar 2027 and 31 Oct 2027; `localToUtc` round-trip every 30 min over the four transition days (A-095); expiry email last day (A-046). `engine.test.ts`: `due_reminders(1440)` and `(120)` select a booking at 08:00 local the day after spring-forward exactly once, and not again after a notification row exists (A-049); `admin_adjust_lot` extend across DST lands on local midnight (A-047) |
| Credit ledger invariants | `engine.test.ts:242` (ledger = cache), `:139` (append-only) | `assertLedgerInvariant()` after every race and payment test. `TRUNCATE credit_ledger` refused (A-086). Retention delete allowed only under `app.retention` (A-011). Erasure note-clear exception doesn't allow delta changes (A-010). Reward classes granted exactly once inside `confirm_payment` (A-038) |
| Waitlist promotion | `engine.test.ts:487,499,509,519,524`; `e2e/waitlist.spec.ts:4` | Cancel in time → the first waiter is `claimed` and booked in the same call, and a direct booking right after gets `full` / `waitlist_first` (A-005). `join_waitlist` beyond the window → `beyond_window` (A-082). Future no-show edit refused (A-083). Late-fill refund only when the class was full (A-081). All `engine.test.ts` |
| Authorization: client A vs client B | none | `e2e/authz.spec.ts`: client B opening A's `/receipts/[id]`, `/api/ics/[id]`, `/bookings/package/[id]` and `/bookings/[id]/confirmed` → 404; calling `cancelAction` with A's booking id → refused; `/api/account/export` contains only own rows. `engine.test.ts` "RLS" describe: anon key plus a user JWT reads only own `bookings`/`payments`/`credit_lots`/`health_notes`, engine RPC execute is denied, clients-only event columns are hidden, and the settings view exposes only public fields (A-041) |
| Authorization: client vs admin | `e2e/admin.spec.ts:7` (client can't open admin) | `e2e/authz.spec.ts`: a client posting an admin server action (`markPaid`) → refused; a client fetching `/admin/export/payments` → 403. `engine.test.ts`: an admin without `can_view_health` can't read `health_notes` (A-001); a pending invite email signing up unconfirmed doesn't become admin (A-002) |
| Studio cancels a class: refunds | `engine.test.ts:449` (unpaid drop-in payment cancelled) | `cancel_session` returns package credits to the same lot with ledger `cancel_refund` note `studio_cancel`, including `credit_cost=2`. Confirmed closure cancels classes and `guard_closed_booking` refuses new bookings. `confirm_closure()` is all-or-nothing (A-038). Paid event outcome per A-031 once Elysia answers. All `engine.test.ts`. Template note per `paid_with`: `tests/unit.test.ts` |
| Account deletion | `engine.test.ts:458` (round-1 fields and weekly rules erased) | Extend `:458` for A-010: no `notifications` row has the old email or name in recipient, subject or body (including studio alerts); `otp_requests`, lot notes, freeze reasons, `stripe_customer_id` and `auth.audit_log_entries` cleared; booking and payment rows kept anonymised. `e2e/account.spec.ts`: sign up → book → export (own data) → delete (type DELETE) → signed out, sign-in refused, the class spot is freed and the waitlist advanced |

### 4.2 Critical and High fix-now findings

| ID | Test (file) |
|---|---|
| A-001 | `engine.test.ts`: `save_health_answers` atomic; withdraw deletes notes plus all history and inserts `granted=false`; "no conditions" after answers deletes history; in-person choice stores nothing and sets `parq_completed_at`; RLS by `can_view_health`. `e2e/health.spec.ts`: a returning client sees an unticked box (or "consented on…"); the in-person choice reaches booking; "Delete my health information" works |
| A-002 | `engine.test.ts`: inserting an `auth.users` row with `email_confirmed_at null` doesn't link a pre-made profile; confirming links it; no `profiles` row with `role='admin' and user_id is null` is created by `addTeamMember` (invite table instead) |
| A-003 | Manual restore drill per `docs/launch/3-backup-restore.md` (owner); optional CI restore into a throwaway Postgres checking the ledger invariant |
| A-004 | `engine.test.ts` race cases from `race.mjs` 6–8 (parallel trials, parallel drop-ins, two accounts one phone) → exactly one `ok` |
| A-005 | See 4.1, Waitlist promotion |
| A-006 | `engine.test.ts`: late-cancelled and no-show unpaid drop-in → `confirm_payment` → payment `paid`, booking status unchanged, `spots_taken` unchanged, never `needs_refund` (also with the class full) |
| A-007 | `engine.test.ts`: `confirm_payment` on a `pack` payment for a trial product raises `not_a_package` (the TS guard in `buyProduct` is covered by code review; the SQL guard is the backstop) |
| A-008 | `e2e/auth.spec.ts`: an imported unlinked `x.y@example.com`; sign up as `x_y@example.com` → separate profile, the import untouched |
| A-009 | `engine.test.ts`: saving changed Terms inserts a new `policy_versions` row and the same text doesn't. `e2e/packages.spec.ts`: a package request stores `terms_version_id` and `accepted_terms_at`; the re-accept sheet appears after a version bump |
| A-010 | See 4.1, Account deletion |
| A-011 | `engine.test.ts`: seed old rows → `enforce_retention()` deletes or anonymises per table and logs counts; recent rows are kept |
| A-012 | `e2e/packages.spec.ts`: the package card shows seller identity, total and withdrawal text. `e2e/booking.spec.ts`: the single-class sheet shows the art. 16(l) notice. Production launch block: `tests/unit.test.ts` on `launchReadiness` |
| A-013 | `e2e/legal.spec.ts`: no "Draft placeholder" on legal pages; the footer links Cookies, Health & Safety and Accessibility; `/legal/cancellation` redirects |
| A-014 | Deployment check: the function log shows `fra1` (owner) |
| A-015 | `tests/notify.test.ts`: Resend 500 then 200 → after two tick retries the row is `sent` with `attempts=2`; an expired offer isn't resent; a sent row whose status update failed isn't resent |
| A-016 | `tests/notify.test.ts`: insert error `08006` → `failed`; `sendCode` → `ok:false` |
| A-017 | `tests/notify.test.ts`: a hanging provider aborts within 8 s. `e2e/resilience.spec.ts`: booking returns while the provider is stubbed to hang (`after()`) |
| A-018 | `tests/notify.test.ts` (tick): a throwing offers step still runs `extend_timetable`, returns `errors:['offers']` and doesn't advance `last_tick_ok_at`; the cron route returns 500 |
| A-019 | `engine.test.ts`: `save_health_answers`, `onboard_profile` and `replace_recurring_rules` roll back fully on a bad row. `e2e/account.spec.ts`: a stubbed delete failure shows `?delete=failed` (by route interception) |
| A-020 | `e2e/resilience.spec.ts`: abort the Secure request → in-page "We lost the connection" notice, not "Application error"; reload shows the booking once; an unknown URL shows the branded not-found |
| A-021, A-022, A-023 | `e2e/resilience.spec.ts` (or `e2e/perf.spec.ts`): count `_rsc` prefetch requests on `/schedule` (≤ 6). Manual before/after with the performance auditor's `count.sh` and fetch logger (class page ≤ 4 stages, signed-in pages 1 auth call) |
| A-024 | `e2e/booking.spec.ts`: a signed-out class page links "Create an account" to `/signup?next=`. `tests/unit.test.ts`: `friendlyError('beyond_window', {weeks:6})` says 6 weeks; the booking note uses `credit_cost` |
| A-025 | `tests/unit.test.ts`: `credits_expiring` and `credits_low` data use the label; a CI grep check forbids interpolating `credit_kind`. `e2e/packages.spec.ts`: the receipt shows the kind label and the "Not a tax invoice" line |
| A-026, A-027 | `e2e/packages.spec.ts`: signed-out request → sign-up link keeps `pick`; after picking, the summary heading is in the viewport and focused |
| A-028 | `tests/unit.test.ts`: the "closed at" helper for a class 2h away |
| A-029 | `e2e/booking.spec.ts` (trial case): the confirmation shows "To pay before class", the amount, the method and `RF-` |
| A-030 | `e2e/packages.spec.ts`: Mark as paid shows a confirm step before granting |

---

## 5. Fix order (work packages)

Each WP is done, tested and committed on its own, in this order. The owner and Elysia actions don't block code work. Start these now, in parallel with WP1:
- A-002 dashboard settings;
- A-003 backups;
- A-014 region and mailbox;
- A-021 JWT keys;
- A-045 OTP;
- the questions in the final list.

Migration file names are proposals. Each is a new file; applied migrations are never edited. Run `npm run db:bundle` and `npm run db:types` after each one.

**WP1: Auth and account linking (Critical first)**
- **IDs:** A-002, A-008, A-044, A-045, A-087, A-088, A-092, A-103.
- **Files:** `supabase/config.toml`, `src/lib/auth.ts`, `src/lib/auth-flow.ts`, `src/app/(client)/login/actions.ts`, `src/app/admin/actions.ts` (`addTeamMember`, `manualBook`, `importClients` lookups), `src/lib/rate-limit.ts`, `src/lib/notifications/templates.ts` (code lifetime copy), `docs/launch/2-production.md`, CLAUDE.md (Decisions: enumeration trade-off).
- **Migration:** `20261106000100_auth_linking.sql`:
  - `handle_new_user` v2, linking confirmed emails only, plus a link-on-confirm update trigger;
  - `team_invites` table (RLS on, no policies);
  - lower-case any stored emails;
  - `otp_requests` purge.
- **Tests:** A-002 and A-008 (§4.2); `engine.test.ts` rate-limit fail-closed for `signin`/`code`.

**WP2: Health data (Critical)**
- **IDs:** A-001, A-105.
- **Files:** `src/app/(client)/health/HealthWizard.tsx`, `health/actions.ts`, `src/lib/health.ts` (`HEALTH_CONSENT_VERSION`, `needsHealthConsent`), `src/lib/profile.ts`, `src/app/(client)/account/page.tsx`, `src/app/admin/HealthInfo.tsx`, `src/app/admin/page.tsx`, `src/app/admin/classes/[id]/page.tsx`, `src/app/admin/clients/[id]/page.tsx`, `src/lib/admin-data.ts`.
- **Migrations:**
  - `20261106000200_enum_values.sql`, enum additions only, used by WP2–WP8:
    - `consent_type`: `health_declaration_offline`, `waiver`, `studio_rules`, `payments_policy`, `early_start`;
    - `notification_status`: `queued`, if WP4 uses it.
  - `20261106000300_health_consent.sql`:
    - `profiles.health_mode` and `profiles.can_view_health`;
    - health RLS by `can_view_health`;
    - `save_health_answers()` (atomic, `parq_completed_at` last; delivers A-019's health part);
    - `withdraw_health_consent()`.
- **Tests:** A-001 (§4.2), `e2e/health.spec.ts`.

**WP3: Booking engine and payments**
- **IDs:** A-004, A-005, A-006, A-007, A-031 (code), A-034, A-035, A-037, A-038, A-039, A-040, A-081, A-082, A-083, plus the events-can't-cancel guard moved into `cancel_booking` (part of A-064).
- **First:** re-run `booking-audit/flows.mjs` cases A–L.
- **Files:** `src/lib/booking.ts` (`buyProduct`, `bookSingle`, `onPaymentPaid`, `cancelBooking`), `src/lib/rewards.ts`, `src/app/(client)/checkout/mock/actions.ts`, `src/lib/payments/*` (no mock in production), `src/app/admin/actions.ts` (`saveSettings` online guard, `updateSession`, `markPaid`, `cancelToday`, `confirmClosure`, `markNoShow`, `setAttendance`), `src/app/admin/page.tsx` (banner), `src/lib/notifications/templates.ts` (`class_cancelled` notes).
- **Migration:** `20261106000400_engine_hardening.sql`:
  - `book_session` v5: advisory locks, `waitlist_first`, late-fill fix;
  - `cancel_booking` v3: in-transaction `process_waitlist`, events guard;
  - `confirm_payment` v4: `fee_paid`, `not_a_package`, reward classes;
  - `join_waitlist` window check;
  - payments partial unique index;
  - `booking_window_days` check 7..182;
  - `use_code()`;
  - `confirm_closure()` / `cancel_sessions()`;
  - capacity-checked `update_session()`.
- **Tests:** 4.1 rows 1, 2, 6 and 8; A-004 to A-007 (§4.2); `credit_cost=2` spend and refund; private sessions refused online (QUAL-12 items).

**WP4: Notifications reliability**
- **IDs:** A-015, A-016, A-017.
- **Files:** `src/lib/notifications/index.ts`, `email.ts`, `sms.ts`, `src/lib/booking.ts` (`after()` wrapping), `src/lib/recurring.ts`, `src/lib/auth-flow.ts` (`sendCode`), `src/app/admin/outbox/page.tsx` (Send again), `src/app/admin/actions.ts` (`sendBirthday` result handling).
- **Migration:** `20261106000500_notifications_retry.sql` (`attempts`, `next_attempt_at`, a retry index).
- **Tests:** `tests/notify.test.ts` (A-015 to A-017).

**WP5: Tick resilience and scheduler**
- **IDs:** A-018, A-049, A-089, A-102.
- **Files:** `src/lib/booking.ts` (`runTick`, `profileById`, reminders, notices), `src/lib/tick.ts`, `src/app/api/cron/tick/route.ts`, `src/app/admin/page.tsx`, `src/app/admin/outbox/page.tsx`, `src/lib/recurring.ts`, `src/app/admin/actions.ts` (chunked import).
- **Migration:** `20261106000600_tick.sql` (`last_tick_ok_at`, `last_tick_error`, `due_reminders(offset)`, a low-credit SQL helper).
- **Tests:** tick isolation in `tests/notify.test.ts`; `due_reminders` in `engine.test.ts`; the `extend_timetable` horizon ≥ window + 14 (QUAL-12).

**WP6: Error handling and atomic writes**
- **IDs:** A-019, A-020, A-054, A-055.
- **Files:**
  - new: `src/app/global-error.tsx`, `src/app/(client)/error.tsx`, `src/app/admin/error.tsx`, `src/app/not-found.tsx`;
  - client: `book/[id]/BookActions.tsx`, `bookings/CancelButton.tsx`, `src/app/(client)/account/actions.ts`, `welcome/actions.ts`, `login/actions.ts` (`resetPassword`);
  - lib: `src/lib/auth.ts`, `src/lib/supabase/admin.ts` (GET retry), `src/lib/recurring.ts`, `src/lib/errors.ts` (merged maps);
  - admin: `src/app/admin/actions.ts` (`must()` and `ActionResult` everywhere), `src/app/admin/photos/actions.ts`.
- **Migration:** `20261106000700_atomic_writes.sql` (`save_timetable()`, `onboard_profile()`, `replace_recurring_rules()`).
- **Tests:** A-019 and A-020 (§4.2); `save_timetable` with an unknown class type leaves the old future classes; "every raise code has a message" in `engine.test.ts`.

**WP7: Privacy lifecycle (erasure, retention, export)**
- **IDs:** A-010, A-011, A-059, A-063.
- **Files:** `src/lib/studio-alerts.ts` (`about_profile_id`), `src/app/(client)/account/actions.ts` (`deleteAccount` order), new `src/lib/export.ts`, `src/app/api/account/export/route.ts`, admin client page (Privacy & data: export and erase), `src/app/admin/actions.ts`, `src/lib/booking.ts` (daily retention call).
- **Migration:** `20261106000800_privacy_lifecycle.sql`:
  - `notifications.about_profile_id`;
  - `erase_profile` v7;
  - `ledger_append_only` exceptions (note-null on erase, delete under `app.retention`);
  - `enforce_retention()`;
  - `studio_settings.last_retention_at`.
- **Tests:** 4.1 Account deletion; A-011 (§4.2); `e2e/account.spec.ts`.

**WP8: Legal documents and acceptance records**
- **IDs:** A-009, A-012, A-013, A-060, A-062, A-104 (A-061 waits for the owner's answer).
- **Files:**
  - legal pages: `src/app/(client)/legal/[slug]/page.tsx`, `src/components/Prose.tsx`, `src/components/Footer.tsx`, `src/lib/terms.tsx`, `src/lib/policy.ts`;
  - booking and packages: `packs/PackagePicker.tsx`, `packs/actions.ts`, `book/[id]/page.tsx` and `BookActions.tsx` (acceptance tick, 16(l) notice);
  - sign-up and welcome: `signup/SignupForm.tsx`, `welcome/WelcomeForm.tsx`, `welcome/actions.ts`, `src/lib/auth-flow.ts`;
  - lib: `src/lib/booking.ts` (terms fields), `src/lib/profile.ts` (`dobSchema`);
  - admin: `src/app/admin/actions.ts` (`saveTexts`, `saveSettings`, manual add and import 18+), `src/app/admin/settings/page.tsx`, `launchReadiness`.
- **Migration:** `20261106000900_policy_versions.sql`:
  - `policy_versions`;
  - `consents.doc_version_id`;
  - `payments.terms_version_id` and `accepted_terms_at`;
  - the `book_session` `minor_not_allowed` guard. This is a small redefinition on top of WP3's v5, so WP8 runs after WP3.
- **Tests:** A-009, A-012 and A-013 (§4.2); `e2e/legal.spec.ts`; `e2e/auth.spec.ts` (18+ boundary dates, A-062).

**WP9: Performance**
- **IDs:** A-014 (code), A-021, A-022, A-023, A-050, A-051, A-052, A-100, A-101.
- **Files:**
  - config: `vercel.json`, `next.config.ts` (`images.remotePatterns`, `staleTimes`);
  - auth: `src/proxy.ts`, `src/lib/auth.ts` (`getClaims`);
  - client pages: `src/app/(client)/book/[id]/page.tsx`, `src/app/(client)/page.tsx`, `schedule/page.tsx`, `packs/page.tsx`, `bookings/page.tsx`, `events/page.tsx`;
  - components: `Footer.tsx`, `BottomNav.tsx`, `DayStrip.tsx`, `ClassRow.tsx`, Bubbles, `PhotoStrip.tsx`, `EventCard.tsx`, `Logo.tsx`;
  - lib: `src/lib/data.ts`, `packages.ts`, `client-history.ts`, `media.ts`, `rewards.ts`, `admin-data.ts`;
  - admin: `src/app/admin/page.tsx`, `stats/page.tsx`, `clients/page.tsx`, `export/payments/route.ts` (paging), `photos/Uploader.tsx` (640px variant).
- **Migration:** `20261106001000_perf_rpcs.sql` (events-only availability, `ct.private` in `session_availability`, `first_class_at(uuid[])`, `payments_by_method(year)`, `locked_events()`).
- **Tests:** `_rsc` count check; Events beyond 7 months still listed (`engine.test.ts` RPC test with seeded far-future events); CSV row count above 1,000 (`engine.test.ts` or a manual check); Lighthouse plus `count.sh` before and after.

**WP10: Copy and UX polish (High UX first)**
- **IDs:** A-024, A-025, A-026, A-027, A-028, A-029, A-030, A-032 (copy), A-070, A-071, A-072, A-073, A-074, A-075, A-076, A-077, A-078, A-079, A-109, A-110.
- **Files:**
  - client pages: `book/[id]/page.tsx`, `BookActions.tsx`, `packs/*`, `bookings/page.tsx`, `bookings/[id]/confirmed/page.tsx`, `bookings/CancelButton.tsx`, `account/*`, `signup/SignupForm.tsx`, `health/HealthWizard.tsx`;
  - components: `src/components/ui.tsx`, `BottomNav.tsx`, `DayStrip.tsx`, `ClassRow.tsx`, `AwaitingPayment.tsx`, `Header.tsx`, `src/app/globals.css`;
  - lib: `src/lib/errors.ts`, `src/lib/booking.ts` (copy only), `src/lib/time.ts`, `src/lib/notifications/templates.ts`;
  - admin: `src/app/admin/PaymentButtons.tsx`, `Attendance.tsx`, `HealthInfo.tsx`, `classes/[id]/*`, `AdminNav.tsx`, `timetable/Builder.tsx`, `photos/Uploader.tsx`, `src/app/admin/page.tsx`;
  - receipts: `src/app/(client)/receipts/[id]/page.tsx`.
- **Migrations:** none.
- **Tests:** A-024 to A-030 (§4.2); an axe run on Home, Schedule, Packs, My classes, Sign-up and Health (`e2e`, axe-core) with 0 serious; 390px and 320px screenshots.

**WP11: Security hardening (database and headers)**
- **IDs:** A-041, A-042, A-043, A-086, A-090, A-091, A-093, A-094.
- **Files:** `next.config.ts` (CSP Report-Only), `src/proxy.ts` (nonce), `src/app/admin/export/payments/route.ts` (`esc`), `src/lib/ics.ts`, `src/app/admin/clients/page.tsx`, `src/app/admin/photos/actions.ts`, CLAUDE.md (6 MB note).
- **Migration:** `20261106001100_rls_grants.sql`:
  - `class_sessions` policy or public view;
  - `studio_settings` public view and revoke;
  - `is_admin` and `my_profile_id` execute for anon;
  - revoke truncate, trigger and references plus default privileges;
  - revoke DML on the health, consent and admin tables;
  - `before truncate` on `credit_ledger`.
- **Tests:** the `engine.test.ts` "RLS" describe (§4.1 authorization); `tests/unit.test.ts` for `esc()` and `buildIcs()` (`\;`, ≤75 octets).

**WP12: Time fixes**
- **IDs:** A-036, A-046, A-047, A-048, A-080, A-095, A-096, A-097, A-098, A-099.
- **Files:** `src/lib/time.ts`, `src/lib/booking.ts` (expiry note, reminder wording), `src/lib/notifications/templates.ts`, `src/app/admin/actions.ts` (import dates, product validity cap, timetable gap refusal), `src/components/Footer.tsx`, `src/app/admin/export/payments/route.ts`, `src/app/(client)/book/[id]/page.tsx`.
- **Migration:** `20261106001200_time_fixes.sql`:
  - `admin_adjust_lot` v4: calendar-day extend and freeze, freeze minus closure days, `bad_days` mapping;
  - `apply_closure` note;
  - `return_credit` and `resume_membership` calendar days.
- **Tests:** 4.1 DST row; import with `2026-12-31`, `31.12.2026` and `rubbish`; extend across 2027-03-28 and 2027-10-31; freeze plus closure overlap counted once.

**WP13: Code quality, config and ops**
- **IDs:** A-003 (runbook, dump workflow, `setup.sql` header), A-056, A-057, A-058, A-064 (remainder), A-065, A-066, A-068, A-069, A-084, A-106, A-107, A-108.
- **Files:**
  - config: `src/lib/env.ts`, new `src/instrumentation.ts`, `scripts/migrate.mjs` (advisory lock, env check), `scripts/widen-types.mjs`, `package.json`, `.nvmrc`;
  - actions and lib: `src/app/admin/actions.ts` (Zod settings and action args), `src/app/(client)/book/[id]/actions.ts`, `src/lib/packages.ts`, `src/lib/client-history.ts`, new `/api/health` route;
  - dead code: listed in A-106;
  - docs and ops: `docs/launch/3-backup-restore.md`, a `.github/workflows/backup.yml` template, `supabase/setup.sql` header, `docs/ARCHITECTURE.md` (function index), CLAUDE.md (expand/contract rule).
- **Migration:** `20261106001300_cleanup.sql` (drop `admin_adjust_credits`, remove dead `free_cancel_until` reads, `seed_demo` and baseline Mat capacity 4).
- **Tests:** `APP_ENV=production node scripts/migrate.mjs` without `NEXT_PUBLIC_SITE_URL` exits non-zero; two parallel `migrate.mjs` runs both exit 0; update `engine.test.ts:133`; settings-form Zod unit tests (empty keeps value, 0 cutoff refused).

**WP14: Test backfill and final verification**
- **IDs:** A-067, plus any mandatory test from §4.1 not yet landed.
- **Files:** `tests/engine.test.ts` (replace the `:215` sleep with polling; private sessions, `credit_cost>1`, closures, `applyRecurring`, reminders and opt-out, health and email-match coverage), `e2e/authz.spec.ts`, `e2e/account.spec.ts`.
- **Migrations:** none.
- **Tests:** the full suite on a production build; re-run the auditors' `race.mjs`, `cutoff.mjs`, `flows.mjs` and `legal-audit/flow.cjs`, then axe and Lighthouse.

**Not scheduled:**
- A-033 and A-085: Elysia.
- A-061: owner.
- A-053: v2.

The code for A-033, A-061 and A-085 is small and goes into WP3, WP8 and WP3 respectively once answered.

---

## 6. Out of scope (feature ideas, collected)

**Product:**
- Wallet pass or an "Add to Apple Calendar" deep link instead of the `.ics` download (UX).
- Remembering the picked package across sign-up as a full "cart", beyond the `?pick=` fix (UX).
- An undo window for client cancellations (UX).
- "Join the waitlist" straight from the Schedule row (UX).
- Admin "swipe to mark paid" or a bulk mark-paid list (UX).
- "Trial available" badges on the Schedule for eligible signed-in clients (UX).
- An admin "Remove as late cancel" choice, if Elysia says no to A-085 now (BOOK-20).
- An email to clients when the studio moves their class: a new template, beyond A-039's warning (BOOK-12/QUAL-09).
- An in-app "Withdraw from this package" button with a `refund_due` flow, if the owner picks email-only withdrawal for now (LEGAL-08).
- An undo for Mark as paid, beyond the A-030 confirm step (UX-07).

**Architecture and performance (v2):**
- Static or cached content pages and Partial Prefetching / `cacheComponents`; `cacheComponents` is deliberately off (PERF-10 → A-053).
- A `book_page_state()` single RPC for the class page (PERF-03 "better still").
- Moving photo upload to a route handler and restoring the 1 MB action body limit (SEC-21).
- Major dependency upgrades (TypeScript 7, ESLint 10, `postgres` 4, `@types/node` 26) (QUAL-13).
- Re-adding the click-to-load map on Contact (QUAL-15/LEGAL cookies).
- Sentry or full error monitoring, if the owner prefers it over the minimal alert (REL-12).
- Renaming the `parq_*` DB columns (QUAL-17).

**Already listed in CLAUDE.md as v2:**
- Wallet passes, auto-renewing memberships, corporate accounts, referrals and gift vouchers.
- Private feedback, demand insights, Greek/Russian, and a motion system.

---

## 7. Coverage: verified OK (merged highlights)

**Booking engine:**
- 10 parallel bookings for a 3-spot class give exactly 3.
- One credit can't be double-spent, and a double-tap on one class gives one booking.
- Mark as paid ×3 grants once (`already_paid`), and cancel ×3 refunds once.
- `process_waitlist` racing a direct booking never exceeds capacity.
- After all the races, `remaining = sum(ledger)` for every lot.
- The 6h boundary is exact: 5:59:59.999 forfeits and 6:00:00 refunds, and the UI uses the same instant.

**Ledger and validity:**
- The ledger is append-only by trigger, with `remaining` CHECKs, and every engine path writes typed entries.
- Validity runs from the first class: it is provisional, recalculated on cancel and locked once the class has passed.
- Closures are counted once. Freezes block only that lot.
- Capacity is enforced on every path: online, manual, weekly, waitlist.

**Rules enforced in SQL:**
- Trial eligibility (account plus phone).
- `pay_later_off`, `online_payments_off`, free, private and clients-only guards.
- Hidden tabs are refused server-side.
- The code once-per-client index.

**Time:**
- All formatting passes the Nicosia timezone explicitly, with output identical under three server TZs.
- Day-key helpers and timetable generation are DST-safe.
- `compute_expiry` uses calendar days.
- There are no `timestamp without time zone` columns.
- Reminders use absolute windows and are deduplicated.
- Birthdays handle 29 Feb. The iOS Safari parsing patterns are safe.

**Security:**
- No secrets in `.next/static` or git history beyond the test dummies and the local demo code.
- `APP_ENV=production` forces demo off.
- All 47 admin actions go through `requireAdmin()`.
- Client actions derive the profile from the session.
- Owner filtering on ICS, receipts, confirmation, package pages and export.
- RLS is on for all 31 tables, and anon or client reads of private tables return nothing.
- Engine RPCs are service-role only.
- Storage has no object policies.
- Email templates are escaped and the Outbox preview is sandboxed.
- `safeNext` covers every redirect.
- Server Actions get the CSRF origin check, and cookies are httpOnly, Lax and Secure.
- The Stripe webhook verifies its signature and is idempotent.
- The cron route refuses requests without the secret.

**Reliability and ops:**
- Migrations apply from scratch (34 files), resume after a mid-way failure and print "up to date" on a re-run.
- `app.env` gating loads her timetable only in production.
- Preview deployments skip migrations.
- 4 concurrent ticks gave no duplicates.
- At a year's volume, the SQL engine runs in milliseconds (`tick` 4.6 ms, `stats_months` 73 ms).
- Email failures are visible in the Outbox.
- The real app refuses sign-in when email isn't configured.
- Erasure keeps an anonymised profile row.

**Performance:**
- Only Inter is preloaded and accent fonts are swapped, with CLS ≤ 0.007.
- Animations are transform-only and reduced motion is respected.
- Full-height skeleton; static assets are immutable.
- papaparse and xlsx load lazily, lucide is tree-shaken, and app chunks are 3–11 KB gzip.
- The indexes cover the hot paths.

**UX and a11y:**
- No horizontal scroll at 390px or 320px except the Privacy table.
- Landmarks, one `h1` per page, a skip link and a visible focus ring.
- `keepValues` keeps input after errors. The OTP input uses `one-time-code`.
- Brand fonts and tokens are respected, and there's no `text-concrete` text.
- The axe contrast failure is only the bottom-nav overlap.

**Legal:**
- Only strictly necessary cookies are set and no third-party requests go out before consent, so no banner is needed.
- Fonts are self-hosted.
- The marketing tick is unticked by default and stored with a version.
- Receipts are payment confirmations, never invoices.
- No VAT is shown unless registered.
- Client-side 18+ is enforced server-side.
- The EAA micro-enterprise exemption applies.

**Quality:**
- typecheck and lint are clean, with no `@ts-ignore`.
- `server-only` is on every DB or secret module.
- Every SECURITY DEFINER function pins `search_path`.
- No ambiguous overloads.
- `setup.sql` matches a fresh bundle.
- Shared pricing and discount logic for display and server.
- The cutoff and waitlist close are read from settings everywhere.

## Open after Phase 4
- **A-001 (WP2), owner + Elysia:** (a) Confirm the "I'd rather tell my instructor in person" option and the new consent wording in `src/app/(client)/health/HealthWizard.tsx` (it names `trader_name` and the studio name; it doesn't promise a retention period until WP7's `enforce_retention()` exists; bump `HEALTH_CONSENT_VERSION` when the text changes). (b) Who may read health answers: the migration `20261106000300` grants `can_view_health` only to `elysia.stephani@gmail.com` (if she is already an admin); set `HEALTH_VIEWER_EMAILS=elysia.stephani@gmail.com` on the production Vercel project as a bootstrap. There is no Settings switch for it yet: should Studio team get one? (c) Remove or limit `petridesart@gmail.com`'s admin role on production after launch. The Privacy Policy health row is A-013 (WP8).

