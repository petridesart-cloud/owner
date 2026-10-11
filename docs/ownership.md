# Who owns what

Every account should belong to **the studio** (Elysia's studio email, ideally a dedicated one like `hello@<studio-domain>`), with the developer invited as an **admin/member**, never the other way round. If the developer disappears, the studio keeps everything.

| Service | What it holds | Owner | Developer access |
|---|---|---|---|
| GitHub (repo) | The code | Studio account or org | Collaborator (write) |
| Vercel | Hosting, domains, env vars (keys) | Studio account (Hobby → Pro when commercial) | Team member |
| Supabase | Database, logins, backups | Studio org | Org member (developer) |
| Stripe *(later)* | Payments, payouts to her bank | Studio, in her name, verified | Team member (Developer role, no payout access) |
| Resend | Email sending | Studio | Member |
| Domain registrar | The web address + DNS (SPF/DKIM) | Studio | Delegated DNS edit if needed |
| Twilio *(optional)* | SMS | Studio | Member |
| Sentry *(planned)* | Error alerts | Studio | Member |

Rules of thumb:
- Billing cards on studio accounts are hers.
- Keys live only in Vercel environment variables, never in chat, email or the code.
- Turn on 2-factor login everywhere.
- When someone stops helping, remove their access the same day.
