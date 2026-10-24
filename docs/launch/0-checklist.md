# Launch checklist (things only you can do)

In order. The app's **Settings → "Before your first client"** list shows what's still missing.

1. **Email (blocks sign-in).** Buy a domain in Elysia's name, create a Resend account (EU),
   add the DNS records, put `RESEND_API_KEY` and `EMAIL_FROM` into Vercel → `reform-studio`
   → Environment Variables, redeploy. Steps: `1-email.md`. Check: Settings → Messages →
   "Send me a test email" lands in the inbox; Gmail "Show original" says SPF/DKIM/DMARC PASS.
2. **Her details.** Sign in to the real app (https://reform-studio-pink.vercel.app/admin) and fill
   in Settings: her full name, studio address, contact email and phone, Revolut link and/or IBAN.
3. **Her timetable and texts.** Classes → Monthly timetable; check package prices, Your texts
   (rules, policy, about her), Photos (logo, studio, her portrait).
4. **Connect the domain** to the `reform-studio` Vercel project (e.g. `book.yourdomain`), then set
   `NEXT_PUBLIC_SITE_URL` to it and redeploy (the reminder scheduler follows it).
5. **Supabase `reform-prod` dashboard:** Authentication → turn off "Allow new users to sign up"
   (the app creates accounts itself), and check the email code length.
6. **Plans (paid, your decision):** Vercel Pro (Hobby is non-commercial only), Supabase Pro for
   daily backups and no pausing, optional error monitoring (Sentry free tier is enough to start).
7. **Legal:** have the Terms and Privacy pages read by a Cyprus lawyer/accountant; confirm her
   self-employed registration and VAT position before taking card payments online.
8. **Payments stay offline** (cash/Revolut/bank, she taps Mark as paid). Online card payments
   stay off until the payments checklist in Settings → Launch checklist is complete; then Stripe
   **test** keys first, live keys last.
9. **Soft launch.** Invite 3–5 regular clients for a week: they sign up, request a package, she
   marks it paid, they book, cancel and rebook. Watch Settings → Messages for failed emails and
   the "Automatic reminders" badge. Then put the link in her Instagram bio.
10. **Keep the demo for testing** (https://reform-pilates-seven.vercel.app). Never send real
    clients there.
