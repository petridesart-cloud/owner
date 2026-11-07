# Production-hardening report

Branch `hardening-pass`, 5–7 November 2026. Nothing has been deployed. Payments are still off and in test mode. No production or demo data was touched; every migration was tested only on a local database.

## 1. Summary
- **Audit:** 8 auditors found 110 issues (`docs/AUDIT.md`): Critical 3, High 27, Medium 49, Low 31.
- **Fixes:** 14 work packages, about 80 commits, each tied to an A-ID (`docs/HARDENING_FIXLOG.md`).
  - All 3 Critical and all 27 High issues are fixed in code.
  - A few need the owner (backups, settings when the app goes live) or a lawyer's read; see §5.
- **Verification:** one fresh round (`docs/VERIFICATION.md`).
  - It found 1 new High issue: the studio's client export gave health answers to admins without health access. That's fixed.
  - It also found 2 Medium and 8 Low issues. 2 of them are fixed and 8 are listed in §6.
  - No second round was needed.
- **Scope:** no new features. Elysia's 7 November answers settled 5 open policy questions, and those are built (§3).

## 2. Tests (fresh `db reset` and production build)

| Suite | Before the pass | Now |
|---|---|---|
| typecheck, lint | clean | clean |
| `test:unit` | none | 41 |
| `test:engine` (booking engine, RLS, ledger) | 54 | 109 |
| `test:notify` (email retries, tick) | none | 16 |
| `test:migrate` (deploy checks) | none | 2 |
| `test:webhook` (Stripe) | 3 | 3 |
| e2e (Playwright, production build) | 10 flows | 33 tests in 15 files |

The 9 mandatory tests all exist and pass:
- concurrent last spot;
- double tap;
- cancel exactly at the 6h cutoff;
- DST reminders;
- ledger invariants;
- waitlist promotion;
- client A vs B and client vs admin;
- studio-cancel refunds;
- account deletion.

Each one's file and test name are in "Test map" in `docs/HARDENING_FIXLOG.md`.

## 3. What changed, by area
- **Sign-in (WP1):**
  - Logins link to client records only after a code proves the email.
  - Admin invites need a code-checked sign-in.
  - Email lookups are exact.
  - Codes go only to existing logins, with a global cap.
  - Rate limits fail closed and use keyed hashes.
  - Sign-up details are used only in the browser that typed them.
  - Supabase Auth settings are set on both projects: public sign-up off, confirm email on, 10-minute codes, 8-character passwords, secure email and password change, site URLs, verification limit 10.
- **Health data (WP2, V-001):**
  - There's a real consent choice, never pre-ticked, plus an "I'd rather tell my instructor in person" option.
  - Clients can delete their health information themselves.
  - Health answers save atomically.
  - Only Elysia (`can_view_health`) can read answers: in RLS, on every admin page and in the client export.
- **Booking engine (WP3):**
  - Per-person locks.
  - The waitlist moves up in the same transaction as the cancel, and nobody can jump the queue.
  - Mark as paid never re-books a late-cancelled or no-show client.
  - One pending request per package.
  - Code limits hold under concurrency.
  - All-or-nothing closures.
  - Class edits are checked.
  - The test checkout is demo-only.
- **Emails and the scheduler (WP4/5):** failed sends are retried, providers time out after 8 s, and emails go out after the response. Each tick step runs on its own, with heartbeats and errors shown on Today. Reminders come from SQL.
- **Errors and privacy (WP6/7):**
  - Saves are all-or-nothing and never show a false "Saved".
  - Error pages are branded.
  - Erasure is complete, including Outbox, notes, invites and the auth log, and the waitlist moves up.
  - Retention runs daily, set by `studio_settings.retention_*`.
  - The data export is complete.
  - The studio can export or erase a client.
- **Elysia's answers (7 Nov):**
  - A studio-cancelled paid event is refunded in full and listed under "Refunds to pay back".
  - A late cancel gets the class back if the studio then cancels the class.
  - Removing a client inside 6h offers a late cancel (the default) or "Remove + return class".
  - Weekly repeat bookings skip classes already inside 6h.
- **Legal (WP8):**
  - Privacy, Terms, Health & Safety acknowledgement, Cookies and Accessibility texts are final, follow the settings and are linked in the footer.
  - `docs/PRIVACY.md`, `TERMS.md`, `WAIVER.md` and `COOKIES.md` are generated from the same texts, and a unit test fails if they drift.
  - Every text is versioned. Sign-up records which version of each accepted document was accepted.
  - The 14-day withdrawal right is in the Terms.
  - Bookings are for adults only, enforced in the database.
- **Security (WP11):**
  - RLS is tightened for the public key: private sessions, clients-only events and studio settings are hidden, and grants are reduced.
  - CSV formulas are neutralised.
  - Calendar files and search terms are cleaned.
  - Uploaded image types are checked from the file's bytes.
  - CSP runs in Report-Only mode with a nonce.
  - A token for a deleted login can't act.
- **Speed and time (WP9/12):**
  - Fewer database round trips: the schedule went from 14 to 8 and the class page from 26 sequential calls to 21 in 3 stages.
  - The proxy only refreshes tokens when needed.
  - No prefetch storms.
  - Lists keep working past 1,000 rows.
  - Images are optimised.
  - Dates and times are correct across clock changes: end dates, Today/Tomorrow, freezes and closures counted once, and import dates.
  - Functions are pinned to Frankfurt (`vercel.json`).
- **Copy, UX and operations (WP10/13):**
  - Wording matches her policy.
  - Accessibility: labels, focus, contrast, 44px targets, and axe passes on the main pages.
  - Validated inputs and dead code removed.
  - A deploy now stops if a production setting is missing.
  - Migrations take an advisory lock.
  - There's a backup and restore runbook.
  - Node 22 is pinned.

## 4. Lighthouse (mobile, local production build)

| Page | Performance before → after | A11y / Best Practices / SEO |
|---|---|---|
| / | 95 → 96 | 100 / 100 / 100 |
| /schedule | 92 → 95 | 100 / 100 / 100 |
| /packs | 90 → 94 | 100 / 100 / 100 |
| /policy | 97 → 99 | 100 / 100 / 100 |
| /login | 99 → 97 (run-to-run variation) | 100 / 100 / 100 |
| /book/[id] | 99 → 97 (run-to-run variation) | 100 / 100 / 100 |

Total Blocking Time dropped on every page (for example /packs 202 → 61 ms), and CLS stays near 0. The real-world gain will mostly come from the Frankfurt region once deployed, since the database is in Frankfurt and functions were in Washington. Full table: `docs/VERIFICATION.md`.

## 5. What the owner needs to do

### Before deploying
1. **Back up the real database.** Follow `docs/launch/3-backup-restore.md`. Decide on Supabase Pro for `reform-prod` and/or the nightly dump template, then run one restore drill (A-003).
2. **Vercel settings on `reform-studio`** (the deploy fails if they're missing, A-057):
   - `CRON_SECRET`: at least 32 characters. Replace it if the current one is shorter.
   - `RATE_LIMIT_SECRET`: new, a random 32+ characters.
   - `HEALTH_VIEWER_EMAILS=elysia.stephani@gmail.com`.
   - Check `NEXT_PUBLIC_SITE_URL`, the three Supabase keys, `RESEND_API_KEY` and `EMAIL_FROM`.
   - Node 22.x on both projects (Settings → General).
3. **Deploy in this order:**
   1. Demo first, then click through it on your phones.
   2. Take a backup.
   3. Production.
   4. Check every page and the Today heartbeat.

   One migration cancels any duplicate pending package request on the real app, keeping the oldest (logged in `audit_log`).

### After deploying
4. Enable asymmetric JWT signing keys in both Supabase projects (A-021). The deleted-login guard is already in place.
5. Check that functions run in `fra1` (Vercel → Settings → Functions).
6. Delete the Supabase access token used for the auth settings, if you haven't already.

### Business and legal
7. **Trader identity:** fill in Elysia's full name, address with postcode, contact email and phone in Admin → Settings → Your studio. Until then the legal pages show `[placeholders]`. Package requests aren't blocked meanwhile, which is your call (A-012).
8. Get a Cyprus lawyer to review `docs/PRIVACY.md`, `TERMS.md`, `WAIVER.md` and `COOKIES.md` before the Instagram link. Confirm the 14-day withdrawal variant (proportionate refund, withdrawal by email).
9. **Data-protection agreements:** sign the Supabase and Resend DPAs and download Vercel's.
   - Move the alert inbox from consumer Gmail to Google Workspace or an EU mailbox.
   - Note Resend's log retention.
   - Fill the two `[…]` placeholders in `src/lib/legal.ts`, then run `npm run legal:docs` (A-010).
10. Confirm the retention periods with your accountant. The defaults are: health answers 12 months after the last class; inactive accounts 24 months; payments and ledger 6 years; messages 12 months. Each is a setting (A-011).
11. Elysia's Revolut link and IBAN go in Settings → How clients pay you (A-079).
12. Choose who receives developer alerts, and whether to use Sentry (A-056). `/api/health` is ready for an uptime monitor.
13. Upgrade `reform-studio` to Vercel Pro before the bio link, as already planned.

### Questions answered (7 Nov)
- **A-061:** birthday emails go to every client (no change).
- **V-008:** only the studio owner (Elysia) can erase another admin's account. Built and tested.
- **A-012:** a class the studio cancels always comes back. If it's near the end of the package, she can extend it with Adjust package → Extend. The Terms now say so.
- **Still open, Elysia (A-065):** should a timetable import be able to end on a date? Today every timetable repeats weekly.
- **Design freeze (A-075/A-109):** the bottom-bar labels are all ink, and the Home pill reads "Rules". Say if she wants either back.

## 6. Known remaining items (Medium/Low, not blocking)
From `docs/VERIFICATION.md`:
- **V-003:** two e2e tests are timing-flaky under full-suite load.
- **V-004:** the client's email stays in the Supabase auth log for up to 90 days after erasure. This is the stated retention.
- **V-005:** if deleting a login fails after erasure, that login could come back as a blank profile.
- **V-006:** `paymentsUnlocked` is callable by anyone (it reveals one yes/no).
- **V-007:** the admin export routes skip the deleted-login check.
- **V-009:** a leftover Maps entry in the CSP, and the `X-Powered-By` header.
- **V-010:** the loading skeletons' `aria-label`.

From `docs/AUDIT.md` (partly done):
- **A-009:** no "I accept" tick on single bookings, and no re-accept prompt when a document changes. Package requests and sign-ups do record versions.
- **A-052:** no 640px upload variant (not needed at her volume).
- **A-099:** no "opens on…" wording.
- **A-068:** 8 moderate dev-only `npm audit` findings.

## 7. Feature ideas (not built; scope freeze)
- **Bookings:**
  - "Join the waitlist" from the Schedule row.
  - An undo window for cancellations.
  - "Trial available" badges.
  - An email when the studio moves a class.
- **Studio admin:**
  - A bulk or swipe Mark as paid.
  - An undo for Mark as paid.
  - An in-app "Withdraw from this package" button.
- **Calendar:** a Wallet pass or an Apple Calendar link.
- **Speed and code:**
  - A single RPC for the class page.
  - Cached content pages.
  - Photo upload as a route handler with a 1 MB action limit.
  - Major dependency upgrades.
  - Renaming the `parq_*` columns.
- **Monitoring:** Sentry.
- **Bigger ideas:** memberships, referrals, gift vouchers, corporate accounts, Greek/Russian, demand insights.

## 8. Where things are
- **`docs/ARCHITECTURE.md`:** how the app works.
- **`docs/AUDIT.md`:** every finding, the fix order and open questions.
- **`docs/HARDENING_FIXLOG.md`:** one row per fix, plus the test map.
- **`docs/VERIFICATION.md`:** the Phase 5 round and Lighthouse.
- **`docs/launch/3-backup-restore.md`:** backups.
- **`CLAUDE.md`:** updated rules and decisions.
