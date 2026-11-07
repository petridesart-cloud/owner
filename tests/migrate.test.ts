// scripts/migrate.mjs: the production settings check and the lock between parallel deploys (A-057, A-058).
// Runs against a throwaway copy of the local database. Run: npm run test:migrate
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";

const PSQL = ["exec", "-i", "supabase_db_owner", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
const sh = (sql: string) => execFileSync("docker", [...PSQL, "-c", sql], { encoding: "utf8" });
const URL = "postgresql://postgres:postgres@127.0.0.1:54322/migtest";

function run(env: Record<string, string>) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn("node", ["scripts/migrate.mjs"], { env: { PATH: process.env.PATH!, ...env } as unknown as NodeJS.ProcessEnv, cwd: process.cwd() }) as ChildProcessWithoutNullStreams;
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code: number | null) => resolve({ code, out }));
  });
}

describe("migrate.mjs", () => {
  before(() => {
    sh("drop database if exists migtest");
    // A copy of the public schema (a template copy isn't possible while the stack is using the database).
    sh("create database migtest");
    execFileSync("docker", ["exec", "-i", "supabase_db_owner", "sh", "-c", "pg_dump -U postgres -n public --no-owner --no-privileges postgres | psql -U postgres -d migtest -q >/dev/null 2>&1; true"]);
    // Everything but the newest file counts as applied, so the two runs below race to apply exactly one migration.
    const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().slice(0, -1);
    const values = files.map((f) => `('${f}')`).join(",");
    execFileSync("docker", [...PSQL.slice(0, 7), "migtest", "-v", "ON_ERROR_STOP=1", "-c",
      `create table public._app_migrations (name text primary key, applied_at timestamptz not null default now()); insert into public._app_migrations (name) values ${values};`], { encoding: "utf8" });
  });
  after(() => { sh("drop database if exists migtest"); });

  test("APP_ENV=production without NEXT_PUBLIC_SITE_URL exits non-zero and says why", async () => {
    const r = await run({ APP_ENV: "production", CRON_SECRET: "x".repeat(32), NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", RESEND_API_KEY: "r", EMAIL_FROM: "f" });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /NEXT_PUBLIC_SITE_URL/);
  });

  test("two migrate runs at once both finish cleanly (advisory lock)", async () => {
    const env = { POSTGRES_URL_NON_POOLING: URL };
    const [a, b] = await Promise.all([run(env), run(env)]);
    assert.equal(a.code, 0, a.out);
    assert.equal(b.code, 0, b.out);
    const applied = (a.out + b.out).match(/applying /g)?.length ?? 0;
    assert.equal(applied, 1, "exactly one run applied the pending migration");
  });
});
