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

## Never
- Never press "Reset demo data" thinking it's the real app: it only exists on the demo.
- Never copy demo clients into the real app.
- Never put live Stripe keys anywhere until the payments checklist is done.
