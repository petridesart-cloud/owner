// Notification delivery and the tick, against the local Supabase with the email provider stubbed.
// Run: npm run test:notify   (tests/server-only-hook.mjs lets the server-only modules load outside Next)
import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

const fileEnv = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
Object.assign(process.env, fileEnv, { DEMO_MODE: "false", RESEND_API_KEY: "re_test_dummy", CRON_SECRET: "cron-test-secret" });
delete process.env.APP_ENV;
delete process.env.EMAIL_REPLY_TO;

const db = createClient<Database>(fileEnv.NEXT_PUBLIC_SUPABASE_URL, fileEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── fetch stub: Resend is faked; Supabase calls go through unless a test intercepts them ──────────
type Handler = (url: string, init: RequestInit) => Promise<Response> | null;
const realFetch = globalThis.fetch;
let intercept: Handler = () => null;
let resend: (body: { to: string[] }, init: RequestInit) => Promise<Response> = async () => Response.json({ id: `re_${Math.random()}` });
const resendCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.resend.com/")) {
    const body = JSON.parse(String(init.body));
    resendCalls.push(body.to[0]);
    return resend(body, init);
  }
  return intercept(url, init) ?? realFetch(input, init);
}) as typeof fetch;

const pgError = (code: string, message: string, status = 503) => Promise.resolve(Response.json({ code, message, details: null, hint: null }, { status }));
const sentTo = (email: string) => resendCalls.filter((e) => e === email).length;
const mail = (tag: string) => `n-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
const row = async (key: string) => (await db.from("notifications").select("*").eq("dedupe_key", `${key}:email`).single()).data!;

let N: typeof import("../src/lib/notifications/index");

before(async () => {
  N = await import("../src/lib/notifications/index");
});
beforeEach(() => {
  intercept = () => null;
  resend = async () => Response.json({ id: `re_${Math.random()}` });
});

describe("A-015: failed messages are retried, not lost behind their dedupe key", () => {
  test("Resend 500 then 200: the tick's retry sends it, attempts = 2, and it isn't sent again", async () => {
    const email = mail("retry"), key = `test-retry:${email}`;
    let calls = 0;
    resend = async () => (++calls === 1 ? new Response("boom", { status: 500 }) : Response.json({ id: "re_ok" }));
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "failed");
    let r = await row(key);
    assert.equal(r.status, "failed");
    assert.equal(r.attempts, 1);
    assert.ok(r.next_attempt_at && new Date(r.next_attempt_at).getTime() > Date.now(), "a retry is scheduled");

    await N.retryFailed(); // not due yet: nothing happens
    assert.equal(sentTo(email), 1);

    await db.from("notifications").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r.id);
    await N.retryFailed();
    r = await row(key);
    assert.equal(r.status, "sent");
    assert.equal(r.attempts, 2);
    assert.equal(r.provider_ref, "re_ok");
    assert.equal(r.next_attempt_at, null);

    await N.retryFailed();
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "duplicate");
    assert.equal(sentTo(email), 2, "sent exactly once after the failure");
  });

  test("the same notify() call later takes over a failed row once it's due (and not before)", async () => {
    const email = mail("reclaim"), key = `test-reclaim:${email}`;
    resend = async () => new Response("down", { status: 500 });
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "failed");
    resend = async () => Response.json({ id: "re_2" });
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "duplicate", "inside the backoff");
    const r = await row(key);
    await db.from("notifications").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r.id);
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi again" }, { dedupeKey: key })).email, "sent");
    const after = await row(key);
    assert.equal(after.status, "sent");
    assert.equal(after.attempts, 2);
  });

  test("an offer that has closed (or a class that has started) is never resent", async () => {
    const email = mail("offer");
    const { data: p } = await db.from("profiles").insert({ full_name: "Offer test", email }).select("id").single();
    const { data: s } = await db.from("class_sessions").select("id").gt("starts_at", new Date(Date.now() + 86_400_000).toISOString()).limit(1).single();
    const { data: past } = await db.from("class_sessions").select("id").lt("starts_at", new Date().toISOString()).limit(1).single();
    const due = new Date(Date.now() - 1000).toISOString();
    const base = { profile_id: p!.id, channel: "email" as const, recipient: email, subject: "x", body: "<p>x</p>", status: "failed" as const, attempts: 1, next_attempt_at: due };
    const { data: rows } = await db.from("notifications").insert([
      { ...base, template: "waitlist_offer", session_id: s!.id, dedupe_key: `offer:test-${Date.now()}:email` },
      { ...base, template: "reminder_2h", session_id: past!.id, dedupe_key: `reminder:120:test-${Date.now()}:email` },
    ]).select("id");
    await N.retryFailed();
    assert.equal(sentTo(email), 0);
    for (const { id } of rows!) {
      const r = (await db.from("notifications").select("status, next_attempt_at, error").eq("id", id).single()).data!;
      assert.equal(r.status, "failed");
      assert.equal(r.next_attempt_at, null);
      assert.match(r.error ?? "", /too late/);
    }
  });

  test("a send whose status update failed stays 'logged' and is never resent", async () => {
    const email = mail("stuck"), key = `test-stuck:${email}`;
    intercept = (url, init) => url.includes("/rest/v1/notifications") && init.method === "PATCH" && String(init.body).includes('"sent"')
      ? pgError("08006", "connection failure") : null;
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "sent");
    intercept = () => null;
    const r = await row(key);
    assert.equal(r.status, "logged");
    await db.from("notifications").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r.id);
    await N.retryFailed();
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "duplicate");
    assert.equal(sentTo(email), 1);
  });

  test("Send again (Outbox) resends one failed row now, whatever its backoff", async () => {
    const email = mail("again"), key = `test-again:${email}`;
    resend = async () => new Response("down", { status: 500 });
    await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key });
    resend = async () => Response.json({ id: "re_again" });
    const r = await row(key);
    assert.deepEqual(await N.retryFailed({ id: r.id }), { sent: 1, failed: 0 });
    assert.equal((await row(key)).status, "sent");
  });
});

describe("A-016: only a real duplicate counts as 'duplicate'", () => {
  test("an Outbox insert error (08006) is 'failed', not 'duplicate', and nothing is sent twice", async () => {
    const email = mail("insert");
    intercept = (url, init) => url.includes("/rest/v1/notifications") && init.method === "POST" ? pgError("08006", "connection failure") : null;
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: `test-insert:${email}` })).email, "failed");
    assert.equal(sentTo(email), 0, "with a dedupe key it isn't sent without its Outbox row");
  });

  test("a login code is still tried without its Outbox row, and a failure is never reported as sent", async () => {
    const email = mail("code");
    intercept = (url, init) => url.includes("/rest/v1/notifications") && init.method === "POST" ? pgError("08006", "connection failure") : null;
    const ok = await N.notify({ email }, "verify_email", { code: "123456" });
    assert.equal(ok.email, "sent");
    resend = async () => new Response("down", { status: 500 });
    const bad = await N.notify({ email }, "verify_email", { code: "123456" });
    assert.equal(bad.email, "failed");
    // sendCode returns ok:false unless the code really went out.
    assert.equal(N.delivered(bad.email), false);
    assert.equal(N.delivered("duplicate"), false);
    assert.equal(N.delivered(ok.email), true);
  });

  test("a real dedupe-key conflict is still 'duplicate'", async () => {
    const email = mail("dupe"), key = `test-dupe:${email}`;
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "sent");
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "duplicate");
  });
});
