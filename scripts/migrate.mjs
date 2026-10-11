// Applies supabase/migrations/*.sql to the deployment's database (in order, once each),
// then seeds demo data on a fresh database when DEMO_MODE=true.
// Runs on Vercel before `next build` (see the vercel-build script). Skips when no
// database URL is configured, so local builds are unaffected.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] no POSTGRES_URL_NON_POOLING; skipping");
  process.exit(0);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "supabase/migrations");

try {
  await sql`create table if not exists public._app_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._app_migrations enable row level security`;
  const done = new Set((await sql`select name from public._app_migrations`).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    console.log(`[migrate] applying ${f}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(fs.readFileSync(path.join(dir, f), "utf8"));
      await tx`insert into public._app_migrations (name) values (${f})`;
    });
  }
  if (process.env.DEMO_MODE === "true") {
    const [{ n }] = await sql`select count(*)::int as n from public.class_types`;
    if (n === 0) {
      console.log("[migrate] fresh database: seeding demo data");
      await sql.unsafe(fs.readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8"));
    }
  }
  console.log("[migrate] up to date");
} finally {
  await sql.end();
}
