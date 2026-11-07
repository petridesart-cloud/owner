# Backups and restoring the real studio database (runbook, A-003)

**Why this exists.** The payments, the credit ledger and the clients are Elysia's accounting record. The free Supabase
plan has no restorable daily backups and no point-in-time recovery, and a paused or lost project can't be undone.
Nothing here touches a database by itself: you run every step. **Never run anything from this page against the demo
(`reform-db`) by mistake, and never run `supabase/setup.sql` on the real database** (it seeds demo clients).

## Owner decisions (needed before this protects anything)
1. Upgrade `reform-prod` to Supabase **Pro** (daily backups, 7 days; add PITR for a few euros more) before the link goes in her Instagram bio, **and/or**
2. approve the nightly dump below: it needs a database URL secret and a destination the studio owns (a private bucket or drive that is not on the same Supabase account).

## Nightly dump (GitHub Action template)
`.github/workflows/backup.yml` is a template: it is **disabled until you add the secrets** and set `if: true`.
It runs `pg_dump --format=custom` of the whole database (including the `auth` schema, so logins come back) and copies
the `media` bucket's file list. Secrets, set by the owner in GitHub → Settings → Secrets (never in the repo):
- `PROD_DB_URL`: the *direct* (non-pooled) connection string of `reform-prod`, a read-only role if you create one.
- `BACKUP_BUCKET` and its credentials (for example an S3-compatible bucket in the EU), or change the upload step to your own storage.
Keep 30 daily dumps; test a restore at least once (below).

## Restore drill (do it once, and after any big change)
1. Create a **new, empty** Supabase project in Frankfurt (call it `reform-restore`). Don't touch `reform-prod`.
2. Restore the dump into it. From a machine with Postgres client tools:
   `pg_restore --no-owner --clean --if-exists --dbname "<RESTORE_DB_URL>" reform-YYYY-MM-DD.dump`
   (Errors about Supabase-owned extensions or roles that already exist are normal. Errors about your own tables are not.)
3. Re-apply anything newer than the dump and re-create the cron job by running the migration script against the restored database:
   `APP_ENV=production POSTGRES_URL_NON_POOLING="<RESTORE_DB_URL>" NEXT_PUBLIC_SITE_URL=https://book.reformpilatescy.com CRON_SECRET=<the real secret> NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… RESEND_API_KEY=… EMAIL_FROM=… node scripts/migrate.mjs`
   It applies only missing migrations, loads her timetable only with `APP_ENV=production`, and (re)creates the `reform-tick` job (it prints the URL it will call: check it).
4. Re-upload the `media` bucket files (logo, photos) from the backup copy; the table `media` already lists them.
5. **Verify the ledger** (SQL editor on the restored project). Both queries must return no rows:
   ```sql
   select l.id, l.remaining, coalesce(sum(e.delta), 0) as ledger
     from public.credit_lots l left join public.credit_ledger e on e.lot_id = l.id
    group by l.id having l.remaining <> coalesce(sum(e.delta), 0);
   select count(*) filter (where user_id is null) as profiles_without_login from public.profiles where role = 'admin';
   ```
   Then open Admin → Today and a client page, and send the test email from Settings → Messages.
6. Only if it is a real disaster: in Vercel (`reform-studio` → Settings → Environment Variables) point `NEXT_PUBLIC_SUPABASE_URL`, the anon key, the service-role key and the Postgres variables at the restored project, redeploy, and tell clients nothing changed. Keep the old project until you're sure.

## After a restore: checks
- Today shows "Automatic reminders last ran … minutes ago" within 10 minutes (the scheduler works); `/api/health` answers 200.
- A test client can sign in with their password (logins came with the `auth` dump). If not, "Forgot password?" works for everyone.
- No demo clients are present.
