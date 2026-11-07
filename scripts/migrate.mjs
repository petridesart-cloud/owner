// Applies supabase/migrations/*.sql to the deployment's database (in order, once each),
// then seeds demo data on a fresh database when DEMO_MODE=true (never when APP_ENV=production).
// Runs on Vercel before `next build` (see the vercel-build script). Skips when no
// database URL is configured, so local builds are unaffected.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Preview deployments never touch a database: their environment variables may point at a real one.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] VERCEL_ENV=${process.env.VERCEL_ENV}; migrations only run on production deployments; skipping`);
  process.exit(0);
}

// A-057: on the real app a missing setting is a failed deploy now, not a 500 later (same rules as src/lib/env-check.ts).
if (process.env.APP_ENV === "production") {
  const e = process.env;
  const problems = [];
  if (!/^https:\/\/[^/\s]+/.test(e.NEXT_PUBLIC_SITE_URL ?? "")) problems.push("NEXT_PUBLIC_SITE_URL must be the https address of the app");
  if ((e.CRON_SECRET ?? "").length < 32) problems.push("CRON_SECRET must be at least 32 characters");
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "EMAIL_FROM"]) if (!e[k]) problems.push(`${k} is missing`);
  if (problems.length) {
    console.error(`[migrate] APP_ENV=production but the settings are incomplete:\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
}

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] no POSTGRES_URL_NON_POOLING; skipping");
  process.exit(0);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { ssl: local ? false : "require", max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "supabase/migrations");

try {
  // A-058: two deploys at once take turns (the lock is held by this connection until it ends).
  await sql`select pg_advisory_lock(hashtext('app_migrations'))`;
  await sql`create table if not exists public._app_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._app_migrations enable row level security`;
  const done = new Set((await sql`select name from public._app_migrations`).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    console.log(`[migrate] applying ${f}`);
    await sql.begin(async (tx) => {
      // Lets a migration tell the real studio app apart (e.g. loading her timetable only there): app.env = production.
      await tx`select set_config('app.env', ${process.env.APP_ENV === "production" ? "production" : "other"}, true)`;
      await tx.unsafe(fs.readFileSync(path.join(dir, f), "utf8"));
      await tx`insert into public._app_migrations (name) values (${f})`;
    });
  }
  if (process.env.APP_ENV === "production" && process.env.DEMO_MODE === "true") {
    console.warn("[migrate] DEMO_MODE is ignored because APP_ENV=production");
  }
  if (process.env.DEMO_MODE === "true" && process.env.APP_ENV !== "production") {
    // Fresh = no classes and no clients yet (class types now come from the baseline migration).
    const [{ n }] = await sql`select (select count(*) from public.class_sessions) + (select count(*) from public.profiles where role = 'client') as n`;
    if (Number(n) === 0) {
      console.log("[migrate] fresh database: seeding demo data");
      await sql.unsafe(fs.readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8"));
    }
  }
  console.log("[migrate] up to date");
  await scheduleTick();
} finally {
  await sql.end();
}

/**
 * Reminders, waitlist offers and expiries run in /api/cron/tick. Supabase's pg_cron calls it
 * every 5 minutes through pg_net, so nothing depends on someone opening the site.
 * Idempotent: cron.schedule replaces the job with the same name.
 */
async function scheduleTick() {
  const secret = process.env.CRON_SECRET ?? "";
  const site = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const target = process.env.TICK_URL || `${site.replace(/\/$/, "")}/api/cron/tick`;
  if (!/^[A-Za-z0-9_+/=.-]{16,}$/.test(secret) || !/^https?:\/\/[\w.:-]+\/api\/cron\/tick$/.test(target)) {
    console.warn("[migrate] scheduler not set up: needs CRON_SECRET (16+ characters, no quotes or spaces) and NEXT_PUBLIC_SITE_URL");
    return;
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    console.log("[migrate] preview deployment: scheduler left as is");
    return;
  }
  const s = postgres(url, { ssl: local ? false : "require", max: 1, onnotice: () => {} });
  try {
    await s`create extension if not exists pg_cron`;
    await s`create extension if not exists pg_net`;
    const command = `select net.http_get(url := '${target}', headers := jsonb_build_object('Authorization', 'Bearer ${secret}'), timeout_milliseconds := 30000)`;
    await s`select cron.schedule('reform-tick', '*/5 * * * *', ${command})`;
    console.log(`[migrate] scheduler: every 5 minutes → ${target}`);
  } catch (e) {
    console.warn("[migrate] scheduler not set up:", e.message);
  } finally {
    await s.end();
  }
}
