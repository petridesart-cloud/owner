# Phase 5 verification (7 Nov 2026)

One fresh, adversarial round on branch `hardening-pass` after Phase 4, against the local stack only (local Supabase, production build on :3000, demo mode). No production or demo calls, no new migrations, payments still off.

## Summary
- **1 High, found and fixed (V-001).** Any studio admin could download a client's health answers and their history through the studio's client export. That bypassed A-001 and the Privacy Policy's "only the instructor can read them". Fixed in `f4fb5e0`, with an e2e test.
- **No Critical issues.** 2 Medium and 8 Low findings are listed below, all left open.
- The original auditors' reproductions were re-run, with small fixes for renamed functions and changed ids made in the scratchpad only. Every booking, cutoff, waitlist, payment, DST and erasure bug they showed is now fixed. The fixes didn't introduce a regression.
- Lighthouse (mobile) is the same as or better than before on all six pages: Accessibility, Best Practices and SEO are 100 everywhere, and Performance is 94–99.
- Full suite on a fresh `db reset` and build: everything passes (counts at the end).

## Findings

| ID | Severity | Status | Location | Finding |
|---|---|---|---|---|
| V-001 | High | fixed (`f4fb5e0`) | `src/app/admin/clients/[id]/export/route.ts`, `src/lib/export.ts` | The studio's client export checked only `role = admin`, so a team member without `can_view_health` (e.g. the developer account) got full health answers and their history. The route now passes `canViewHealth()`. A withheld export says so in the file instead of being quietly incomplete. Test: e2e "a studio member without health access gets no health answers in a client export (V-001)". |
| V-002 | Medium | fixed | `src/lib/legal.ts` (Cookies), `docs/COOKIES.md` | The Cookies Policy doesn't list `rf_signup`. That's an essential, httpOnly cookie that lasts up to 24 hours, set at Create account and deleted once the email is confirmed (`login/actions.ts:29`). It's the only first-party cookie besides `sb-…-auth-token`. Add one row to the table. |
| V-003 | Medium | open | `e2e/a11y.spec.ts`, `e2e/packages.spec.ts` | Two e2e tests are timing-flaky under full-suite load. In the first run they failed: axe ran while a loading skeleton was on screen (see V-010), and "Secure your spot · 1 class" wasn't found within 60 s. Both passed alone and in a second full run. A flaky gate can hide a real failure. |
| V-004 | Low | open | `erase_profile` (`20261106…` WP7), `src/lib/erase.ts` | Erasure leaves the client's email in `auth.audit_log_entries`. The `user_signedup` and `user_modified` rows written by `service_role` keep it in `traits`, which `erase_profile` doesn't match (it matches `actor_id`/`actor_username` only). The `user_deleted` row is written after the erase. `enforce_retention()` purges these after 90 days, and the Privacy Policy states "Sign-in records: 90 days". |
| V-005 | Low | open | `src/lib/erase.ts` `deleteLogin` | If `auth.admin.deleteUser` fails after `erase_profile` succeeded, the leftover login still works. On its next request `ensureProfile` creates a new, empty profile for it, and the email stays in `auth.users`. The comment says such a login "can't reach anything". The failure is rare and logged. |
| V-006 | Low | open | `src/app/admin/actions.ts:627` | `paymentsUnlocked()` is exported from a `"use server"` file without `admin()`, so anyone can call it as a Server Action. It only returns whether the payment checklist is done. Move it out of the actions file. |
| V-007 | Low | open | `src/app/admin/export/payments/route.ts`, `src/app/admin/clients/[id]/export/route.ts` | Both admin route handlers check the role through `getViewer()` but not `loginExists()` the way `requireAdmin()` does. With asymmetric keys (A-021), a deleted admin login's token could still export for up to an hour. |
| V-008 | Low | open | `src/app/admin/actions.ts` `eraseClient` | Any admin can erase another admin's account (only erasing yourself is refused). That's a policy question, added to AUDIT.md "Open after Phase 4". |
| V-009 | Low | open | `src/lib/csp.ts`, `next.config.ts` | The CSP still allows `frame-src https://www.google.com https://maps.google.com`, but no map is embedded any more. The `X-Powered-By: Next.js` header is still sent (`poweredByHeader: false`). |
| V-010 | Low | open | `src/app/(client)/loading.tsx`, `src/app/(client)/schedule/loading.tsx` | Both skeletons put `aria-label` on a `<div>` with no role, which axe reports as `aria-prohibited-attr` when it runs during loading. Add `role="status"` or drop the label. |
| V-011 | Low | fixed | `src/lib/legal.ts` (Cookies), `docs/COOKIES.md` line 3 | "Shown in the app at /legal/cookies, where the version you accepted is recorded" is wrong: sign-up records only terms, studio_rules, payments_policy and waiver (correct, since the Cookies Policy is a notice). Reword. |

Checked and found sound (no finding):
- **RLS sweep as `anon` and as a client JWT** (every public table: select, update, delete and insert in a rolled-back transaction). Clients see only their own rows. `anon` sees only public catalogues and sessions, with the clients-only event hidden. Inserts are refused everywhere, and `studio_settings` refuses non-public columns. No engine function can be executed by `anon` or `authenticated`. Storage has no policies, so only the service role writes.
- **Studio actions:** every exported Server Action in `src/app/admin/**` goes through `admin()`/`requireAdmin()`, except V-006.
- **Client actions:** they take no profile or lot ids from forms. The mock checkout is demo-only and own-payment-only. `cancelBooking` can't be given `admin`/`returnCredit` from the client.
- **Auth linking:** `handle_new_user` + `handle_user_confirmed` never link a profile on an auto-confirmed signUp made in the same transaction. `ensureProfile` links only when the email was just proven. Invites and `ADMIN_EMAILS` grant admin only on a verified sign-in.
- **Late cancel and studio Remove** (`cancel_booking` v4, in SQL):

  | Case | Booking status | Class |
  |---|---|---|
  | Studio removes inside 6h, default | `late_cancelled` | not returned |
  | Studio "Remove + return class" | `cancelled` | returned |
  | Studio removes more than 6h before | `cancelled` | returned |
  | Client cancels inside 6h | `late_cancelled` | not returned |

  In every case the waiter was booked in the same transaction.
- **Cutoff boundary:** 5:59:59.999 → late, exactly 6:00:00 → in time.
- **Waitlist:** the old race "a direct booker takes the freed spot before `process_waitlist`" no longer reproduces (`direct=full`, the waiter is booked).
- **Erasure:** the full `legal-audit/flow.cjs` (sign-up, health, package request, export, delete) leaves no row in any public table holding the email. The client's Outbox rows are erased, and the cookies are cleared.
- **CSP:** a fresh nonce on every request, and only one inline script, carrying the nonce. No cookie is set on anonymous pages.
- **Routes:** `/api/health` exposes only `ok` and the tick age. `/api/cron/tick` answers 401 without the secret.
- **`scripts/migrate.mjs`:** on `APP_ENV=production` the deploy fails when a setting is missing, the demo seed is impossible, and `app.env` is set for each migration.
- **Time:** `src/lib/time.ts` gives identical output under UTC, New York and Kiritimati. The SQL DST checks are correct, including closures crossing the spring change. The only remaining `localToUtc` "mismatches" are the non-existent 03:00–03:59 on spring-forward nights, which move forward to 04:00, as expected.
- **Concurrent ticks** (4 at once): no duplicate dedupe keys. Notifications under a provider fault are marked failed, not hung.

## Lighthouse (mobile, local production build, Lighthouse 12.8.2)

The Before column is the latest earlier run:
- Performance, LCP, TBT and CLS: 5 Nov (`lh/2026-11-05/`, performance-only).
- A11y, BP and SEO: 11 Oct (`lh/*.json`).
- `/policy`: all values from 11 Oct (it wasn't in the 5 Nov run).

The new reports are in `scratchpad/lh/2026-11-07/`.

| Page | Perf before → after | A11y | BP | SEO | LCP before → after | TBT before → after | CLS before → after |
|---|---|---|---|---|---|---|---|
| `/` | 95 → **96** | 100 → 100 | 100 → 100 | 100 → 100 | 2.81 s → 2.83 s | 65 → **47 ms** | 0.001 → 0.004 |
| `/schedule` | 92 → **95** | 100 → 100 | 100 → 100 | 100 → 100 | 2.99 s → **2.86 s** | 91 → **75 ms** | 0.000 → 0.000 |
| `/packs` | 90 → **94** | 100 → 100 | 100 → 100 | 100 → 100 | 3.15 s → 3.14 s | 202 → **61 ms** | 0.000 → 0.000 |
| `/policy` | 97 → **99** | 100 → 100 | 100 → 100 | 100 → 100 | 2.56 s → **2.11 s** | 38 → 44 ms | 0.000 → 0.000 |
| `/login` | 99 → 97 | 100 → 100 | 100 → 100 | 100 → 100 | 1.77 s → 2.52 s | 111 → **39 ms** | 0.000 → 0.000 |
| `/book/[id]` | 99 → 97 | 100 → 100 | 100 → 100 | 100 → 100 | 1.78 s → 2.61 s | 127 → **47 ms** | 0.000 → 0.000 |

`/login` and `/book` lost 2 points of LCP-driven score. That's within run-to-run noise on this machine: the same pages were 2.49 s and 3.01 s on 11 Oct. TBT dropped on every page but `/policy`.

## Legal docs vs code

| Claim | Where | Code | Result |
|---|---|---|---|
| 6h cancellation rule: in time = class back with its original expiry, late or no-show = class used | TERMS.md §cancellation, `/policy/payments`, `/legal/terms`, booking emails | `cancel_booking` v4, `cancellation_cutoff_hours` 6; boundary test above | matches |
| A studio-cancelled class always comes back, also after a late cancel | TERMS.md, `/policy/payments` | `cancel_session` v2 (flows F: remaining 1) | matches |
| A studio-cancelled paid event is refunded in full | TERMS.md, `EVENT_POLICY` | `needs_refund` + Today "Refunds to pay back" (flows G) | matches |
| Retention periods (messages 12 mo, audit 24 mo, sign-in 90 d, event extras 3 mo, codes 12 mo, consents 3 y, health 12 mo, account 24 mo, payments 6 y, notice 30 d) | PRIVACY.md retention table | `studio_settings.retention_*` defaults = the same values; `enforce_retention()` | matches (V-004: erased emails stay in the auth log up to 90 days, as stated) |
| Only the instructor reads health answers | PRIVACY.md, `/legal/privacy`, `/health` | RLS `can_view_health()`; every admin render gated | **was broken by the studio export (V-001), fixed** |
| Cookies: essential only, `sb-…-auth-token` up to 400 days, httpOnly, Secure | COOKIES.md | Real Set-Cookie: `sb-127-auth-token(.0/.1)` Max-Age 34560000 (400 d), HttpOnly, Secure, SameSite=Lax; `rf_signup` HttpOnly, Lax, ≤24 h; nothing on anonymous pages; no local/session storage; only first-party requests | `rf_signup` missing (V-002); "version you accepted is recorded" inaccurate (V-011) |
| Versioned acceptance at sign-up | PRIVACY.md, Terms | `consents` rows terms, studio_rules, payments_policy, waiver, each with `doc_version_id`; package requests store `terms_version_id` + `accepted_terms_at`; marketing unticked by default; health consent never pre-ticked | matches |

## Suite (fresh `db reset` and build, after the fix)
- `typecheck` and `lint`: clean.
- `test:unit` 41/41, `test:engine` 109/109, `test:notify` 16/16, `test:migrate` 2/2, `test:webhook` 3/3.
- e2e: 33/33 on the second full run. The first full run had 31/33, with the two timing flakes in V-003; both passed when rerun.
