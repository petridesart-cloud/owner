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

describe("A-017: a hanging provider can't hold anything up", () => {
  test("Resend that never answers is aborted within 8 s and the row is retryable", async () => {
    const email = mail("hang"), key = `test-hang:${email}`;
    resend = (_b, init) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    const t = Date.now();
    const alive = setTimeout(() => {}, 12_000); // AbortSignal.timeout's timer doesn't keep the test process alive by itself
    assert.equal((await N.notify({ email }, "birthday", { note: "Hi" }, { dedupeKey: key })).email, "failed");
    clearTimeout(alive);
    const took = Date.now() - t;
    assert.ok(took >= 7_500 && took < 9_500, `aborted after ${took} ms`);
    assert.ok((await row(key)).next_attempt_at);
  });
});

describe("A-018: one failing tick step doesn't stop the others, and it shows", () => {
  const settings = async () => (await db.from("studio_settings").select("last_tick_ok_at, last_tick_error, last_cron_tick_at").eq("id", 1).single()).data!;

  test("a throwing offers step still runs extend_timetable, returns errors ['offers'] and doesn't advance last_tick_ok_at", async () => {
    const { runTick } = await import("../src/lib/booking");
    const before = await settings();
    let extended = 0;
    intercept = (url) => {
      if (url.endsWith("/rest/v1/rpc/tick")) return pgError("XX000", "boom", 500);
      if (url.endsWith("/rest/v1/rpc/extend_timetable")) extended++;
      return null;
    };
    const t = Date.now();
    const r = await runTick("cron");
    assert.deepEqual(r.errors, ["offers"]);
    assert.equal(extended, 1, "the timetable was still topped up");
    const after = await settings();
    assert.equal(after.last_tick_ok_at, before.last_tick_ok_at);
    assert.match(after.last_tick_error ?? "", /offers/);
    assert.ok(new Date(after.last_cron_tick_at!).getTime() >= t - 1000, "the run itself is recorded");
  });

  test("the cron route answers 500 when a step failed, 200 when all worked (and clears the error), 401 without the secret", async () => {
    const { GET } = await import("../src/app/api/cron/tick/route");
    const req = (auth?: string) => new Request("http://localhost/api/cron/tick", { headers: auth ? { authorization: auth } : {} });
    assert.equal((await GET(req())).status, 401);
    assert.equal((await GET(req("Bearer wrong-secret-same-len"))).status, 401);
    intercept = (url) => (url.endsWith("/rest/v1/rpc/tick") ? pgError("XX000", "boom", 500) : null);
    assert.equal((await GET(req("Bearer cron-test-secret"))).status, 500);
    intercept = () => null;
    const ok = await GET(req("Bearer cron-test-secret"));
    assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
    const s = await settings();
    assert.equal(s.last_tick_error, null);
    assert.ok(s.last_tick_ok_at);
  });

  test("a missing profile is skipped, not thrown (profileById)", async () => {
    const { notifyOffers } = await import("../src/lib/booking");
    const { data: w } = await db.from("waitlist_entries").select("id").limit(1).maybeSingle();
    await notifyOffers([{ entry_id: w?.id ?? "00000000-0000-0000-0000-000000000000", profile_id: "00000000-0000-0000-0000-000000000000", offer_expires_at: new Date(Date.now() + 3_600_000).toISOString() }]);
  });
});

describe("A-049: the page-view tick is only a fallback", () => {
  test("runs only when the last tick is 10 minutes old (or never ran)", async () => {
    const { pageTickDue } = await import("../src/lib/tick");
    const now = Date.now();
    assert.equal(pageTickDue(null, now), true);
    assert.equal(pageTickDue(new Date(now - 9 * 60_000).toISOString(), now), false);
    assert.equal(pageTickDue(new Date(now - 10 * 60_000).toISOString(), now), true);
  });
});

describe("A-032: nothing promises a free-cancel time that has passed (her answer, 7 Nov)", () => {
  const H = 3_600_000, D = 86_400_000;
  const reformer = async () => (await db.from("class_types").select("id").eq("slug", "reformer").single()).data!.id;
  /** A start time (up to 1.5h later than asked) on an odd minute, so no timetable or earlier test class shares its slot. */
  const oddStart = (ms: number) => { const d = new Date(Date.now() + ms + Math.floor(Math.random() * 90) * 60_000); d.setUTCSeconds(0, 0); if (d.getUTCMinutes() % 5 === 0) d.setUTCMinutes(d.getUTCMinutes() + 2); return d; };
  const klass = async (type: string, at: Date, capacity = 3) => {
    const { data, error } = await db.from("class_sessions").insert({ class_type_id: type, starts_at: at.toISOString(), ends_at: new Date(at.getTime() + 50 * 60_000).toISOString(), capacity, title: "Notify test" }).select("id").single();
    assert.ifError(error);
    return data!.id;
  };
  const person = async (tag: string, credits: number) => {
    const { data } = await db.from("profiles").insert({ full_name: `Notify ${tag}`, email: mail(tag), onboarded_at: new Date().toISOString() }).select("id").single();
    if (credits) await db.rpc("grant_lot", { p_profile: data!.id, p_kind: "reformer", p_credits: credits, p_expires: new Date(Date.now() + 30 * D).toISOString(), p_note: "test" });
    return data!.id;
  };

  test("a waitlist auto-booking inside 6h says it can't be cancelled for a refund", async () => {
    const { notifyOffers } = await import("../src/lib/booking");
    const sid = await klass(await reformer(), oddStart(3 * H), 1);
    const a = await person("wl-a", 1), b = await person("wl-b", 1);
    const ra = await db.rpc("book_session", { p_profile: a, p_session: sid, p_mode: "credit" });
    assert.ifError(ra.error);
    assert.ifError((await db.rpc("join_waitlist", { p_profile: b, p_session: sid })).error);
    const { data } = await db.rpc("cancel_booking", { p_booking: (ra.data as { booking_id: string }).booking_id, p_profile: a });
    const offers = (data as { offers: { entry_id: string; profile_id: string; offer_expires_at: string | null }[] }).offers;
    assert.equal(offers.length, 1);
    await notifyOffers(offers);
    const r = await row(`waitlist-booked:${offers[0].entry_id}`);
    assert.doesNotMatch(r.body ?? "", /Free cancellation until/);
    assert.match(r.body ?? "", /inside the 6-hour window, so it can(&#39;|')t be cancelled for a refund/);
  });

  test("weekly repeat bookings skip a class already inside the cutoff and start from the next one", async () => {
    const { applyRecurring, slotOf } = await import("../src/lib/recurring");
    const type = await reformer();
    const soon = oddStart(3 * H);
    const next = new Date(soon.getTime() + 7 * D);
    const [s1, s2] = [await klass(type, soon), await klass(type, next)];
    const p = await person("weekly", 4);
    const { weekday, hhmm } = slotOf(soon.toISOString());
    if (slotOf(next.toISOString()).hhmm !== hhmm) return; // a clock change in between moves the slot: nothing to check
    await db.from("recurring_rules").insert({ profile_id: p, class_type_id: type, weekday, start_time: hhmm });
    await applyRecurring(p);
    const { data: bs } = await db.from("bookings").select("session_id").eq("profile_id", p).eq("status", "confirmed");
    const ids = (bs ?? []).map((b) => b.session_id);
    assert.ok(!ids.includes(s1), "the class inside 6h wasn't booked");
    assert.ok(ids.includes(s2), "the next week's class was");
  });
});

describe("a deleted login's leftover token (WP13)", () => {
  test("ensureProfile creates nothing for a user id that no longer exists in Auth, and still works for a real login", async () => {
    const { ensureProfile } = await import("../src/lib/auth");
    const ghost = crypto.randomUUID();
    assert.equal(await ensureProfile(ghost, mail("ghost")), null);
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("user_id", ghost);
    assert.equal(count, 0);
    const email = mail("real");
    const { data: made, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    assert.ifError(error);
    const p = await ensureProfile(made.user!.id, email);
    assert.ok(p, "a real login still gets its profile");
    // Delete the login, as erasure does: the same token can no longer create another profile.
    await db.from("profiles").delete().eq("id", p.id);
    await db.auth.admin.deleteUser(made.user!.id);
    assert.equal(await ensureProfile(made.user!.id, email), null);
    const { count: after } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("user_id", made.user!.id);
    assert.equal(after, 0);
  });
});
