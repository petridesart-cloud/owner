# Expected running costs

Estimates for a 1-instructor, 3-reformer studio (≈ 50–150 bookings/month). Check each provider's current pricing; these move.

| Item | Free tier covers it? | Typical cost |
|---|---|---|
| Vercel hosting | Hobby is free but for **non-commercial** use; a paying studio should use **Pro** | €0 now / ~€20 per month on Pro |
| Supabase (EU) | Free tier fits the data easily, but pauses after a week of inactivity and has no daily backups | €0 for the demo / ~€25 per month on Pro (daily backups, no pausing), recommended at launch |
| Domain (e.g. reformpilates.cy / .com) | n/a | ~€10–40 per year |
| Email (Resend) | Free up to ~3,000 emails/month | €0 |
| SMS (Twilio, optional) | Pay per message | ~€0.05–0.10 per SMS (keep it optional) |
| Stripe *(when online payments go live)* | No monthly fee | ~1.5% + €0.25 per EU card payment |
| Sentry (errors) | Free developer plan | €0 |

**Realistic totals:**
- **Demo / testing:** €0 per month.
- **Live, lean:** about €45–50 per month (Vercel Pro + Supabase Pro), plus the domain. Email is free; SMS only if wanted.
- **Live, minimum viable:** you can start on free tiers, but you lose daily backups and Supabase may pause. Not recommended once real clients and payments are involved.
