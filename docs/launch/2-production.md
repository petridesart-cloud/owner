# Two apps: demo (staging) and the real studio app

| | Demo / staging | Real studio app (production) |
|---|---|---|
| Address | https://reform-pilates-seven.vercel.app | https://book.reformpilatescy.com (domain on Cloudflare; reform-studio-pink.vercel.app also works) |
| Vercel project | `reform-pilates` | `reform-studio` |
| Database | Supabase `reform-db` (demo clients, resettable) | Supabase `reform-prod` (real clients only, never reset) |
| Mode | `DEMO_MODE=true`: codes on screen, nothing emailed | `APP_ENV=production`: demo impossible, real emails |
| Use it for | trying changes, showing Elysia, tests | real bookings |

Both deploy automatically on every push to `claude/pilates-booking-app-sk3trx`, and run the
database migrations first. Try changes on the demo before telling clients about them.

## What's set on the real app (Vercel → reform-studio → Settings → Environment Variables)
- `APP_ENV=production`, `DEMO_MODE=false`
- `ADMIN_EMAILS` (bootstrap admins), `CRON_SECRET` (random, used by the 5-minute scheduler)
- `NEXT_PUBLIC_SITE_URL=https://book.reformpilatescy.com` (CNAME `book` → Vercel in Cloudflare, DNS only)
- Supabase variables (added automatically by the integration)
- `RESEND_API_KEY` (send-only, domain-restricted) and `EMAIL_FROM` = `Re·Form Pilates <hello@mail.reformpilatescy.com>`: email is live.
- Optional `RATE_LIMIT_SECRET` (random, 32+ characters): key for the hashed rate-limit records. Without it the app uses `CRON_SECRET`.

## Supabase Auth settings (both `reform-prod` and `reform-db`; owner action, audit A-002 / A-045)
The app creates logins itself (admin API) and proves emails with its own codes. Supabase's public Auth API
must not offer a second way in. In each project's dashboard (Authentication → Sign In / Providers, Emails, Rate Limits):
- **Allow new users to sign up: off.** Email provider stays enabled (the app needs it for passwords and codes).
- **Confirm email: on.**
- **Secure email change: on**, and **Secure password change: on**.
- **Email OTP expiration: 600 seconds** (the code emails say 10 minutes). OTP length 6 or 8 (the app accepts 6–10 digits).
- **Rate limits → Token verifications:** lower it (for example 10 per 5 minutes per IP).
- Record the values you found before changing them here: _(to fill in)_.

If one of these is wrong, the code still never hands an existing client record or a Studio-team invite to a login
created outside the app (records are linked, and invites granted, only after a code from the email is used; see
`20261106000100_wp1_auth_linking.sql`). What remains open with sign-ups on and confirmation off is someone
registering an unused email address they don't own, which is why the settings matter. `supabase/config.toml` mirrors these settings for local development.

## Never
- Never press "Reset demo data" thinking it's the real app: it only exists on the demo.
- Never copy demo clients into the real app.
- Never put live Stripe keys anywhere until the payments checklist is done.
