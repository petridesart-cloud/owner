# Launch step: email that reaches the inbox

Clients sign in with a code sent by email, and get confirmations and reminders by email.
Until this is done the real app can't be used (it says "Sign-in by email isn't switched on yet").

You need: a domain for the studio, and a free Resend account (3,000 emails a month free; enough to start).

## 1. Get a domain (paid, about €10–40 a year)
Pick something short, e.g. `reformpilates.cy` (needs a Cyprus connection, via a .cy registrar) or `reformpilates.com`.
Buy it from any registrar (Namecheap, Cloudflare, GoDaddy, or a .cy registrar).
Put it in **Elysia's name** (or the business's), not yours. It's hard to move later.

## 2. Create the Resend account
1. Go to resend.com and sign up, ideally with the studio's email.
2. **Domains → Add domain**: enter `mail.yourdomain` (a subdomain keeps her main email separate),
   region **EU (Ireland)**.
3. Resend shows 3–4 DNS records (SPF and DKIM; MX for bounces). Add each one at your registrar's
   DNS page exactly as shown. Then add one more record yourself (DMARC, helps avoid spam):
   - Type `TXT`, name `_dmarc.mail` (or `_dmarc`), value `v=DMARC1; p=none; rua=mailto:YOUR-EMAIL`
4. Wait until Resend shows the domain as **Verified** (minutes to a few hours).
5. **API Keys → Create API key**, permission "Sending access", domain = the one above. Copy it.

## 3. Put the key in Vercel (never in a chat or a file)
In Vercel → the **production** project → Settings → Environment Variables (Production):
- `RESEND_API_KEY` = the key you copied
- `EMAIL_FROM` = `Re·Form Pilates <hello@mail.yourdomain>`

Then redeploy (Deployments → ⋯ → Redeploy).

## 4. Check it
1. Sign in to the admin → **Settings → Messages**. The Email badge should say **Live**.
2. Tap **Send me a test email**. It should arrive in your inbox, not spam.
   In Gmail, open it → ⋮ → "Show original": SPF, DKIM and DMARC should all say **PASS**.
3. Sign out and sign in with your own email: the code arrives within a few seconds.

If the test says "Sending failed", the message in the list below it shows Resend's reason.
Usually the domain isn't verified yet.
