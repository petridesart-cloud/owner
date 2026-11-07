// Pure TypeScript helpers (no database). Run: npm run test:unit
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ipFrom, keyHash, limitOutcome, normEmail } from "../src/lib/request-keys";
import { needsHealthConsent } from "../src/lib/health";
import { cancelledOutcome, render } from "../src/lib/notifications/templates";
import { friendlyError, must } from "../src/lib/errors";
import { cronAuthorized } from "../src/lib/cron-auth";
import { schedulerWarning } from "../src/lib/scheduler";
import { retryingFetch } from "../src/lib/supabase/retry-fetch";

describe("rate limits and email keys (A-045, A-092, A-103, A-008)", () => {
  test("sign-in and code limits fail closed when the check errors; booking limits fail open", () => {
    const err = { message: "boom" };
    for (const kind of ["signin", "signin_ip", "code", "code_ip", "code_all"]) assert.equal(limitOutcome(kind, null, err), true, kind);
    assert.equal(limitOutcome("booking", null, err), false);
    assert.equal(limitOutcome("signin", true, null), true);
    assert.equal(limitOutcome("signin", false, null), false);
  });

  test("the client IP prefers the platform headers over x-forwarded-for", () => {
    const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
    assert.equal(ipFrom(h({ "x-forwarded-for": "6.6.6.6, 1.1.1.1", "x-vercel-forwarded-for": "1.2.3.4" })), "1.2.3.4");
    assert.equal(ipFrom(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "5.5.5.5" })), "5.5.5.5");
    assert.equal(ipFrom(h({ "x-forwarded-for": "6.6.6.6, 1.1.1.1" })), "6.6.6.6");
    assert.equal(ipFrom(h({})), "local");
  });

  test("rate-limit keys are keyed hashes, not plain SHA-256 of the email", () => {
    const a = keyHash("secret-a", "Maria@Example.com");
    assert.equal(a, keyHash("secret-a", "maria@example.com "));
    assert.notEqual(a, keyHash("secret-b", "maria@example.com"));
    assert.notEqual(a, createHash("sha256").update("maria@example.com").digest("hex"));
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test("emails are compared exactly, lower-case", () => {
    assert.equal(normEmail("  X_Y@Example.COM "), "x_y@example.com");
  });
});

describe("health consent rule (A-105)", () => {
  test("consent is needed whenever something would be stored, including only 'other medication'", () => {
    assert.equal(needsHealthConsent({ conditions: [], bpMeds: false, medication: null }), false);
    assert.equal(needsHealthConsent({ conditions: [], bpMeds: false, medication: "   " }), false);
    assert.equal(needsHealthConsent({ conditions: [], bpMeds: false, medication: "Thyroxine" }), true);
    assert.equal(needsHealthConsent({ conditions: [], bpMeds: true, medication: null }), true);
    assert.equal(needsHealthConsent({ conditions: ["back"], bpMeds: false }), true);
    assert.equal(needsHealthConsent({ conditions: [], details: "something" }), true);
  });
});

describe("studio-cancelled class: what happens to what they paid with (A-031)", () => {
  test("package classes come back; a paid event isn't promised a class; unpaid and free say nothing to pay", () => {
    assert.match(cancelledOutcome("credit", true), /class is back in your account/);
    assert.match(cancelledOutcome("payment", true), /class is back in your account/);
    assert.match(cancelledOutcome("payment", false), /in touch about your payment/);
    assert.doesNotMatch(cancelledOutcome("payment", false), /back in your account/);
    assert.match(cancelledOutcome("pay_at_studio", true), /nothing to pay/);
    assert.match(cancelledOutcome("free", false), /nothing to pay/);
  });

  test("the class_cancelled email and SMS use that outcome", () => {
    const r = render("class_cancelled", { className: "SUP Pilates", when: "Sat", outcome: cancelledOutcome("payment", false) });
    assert.ok(r.lines.some((l) => /in touch about your payment/.test(l)));
    assert.ok(!r.lines.some((l) => /back in your account/.test(l)));
    assert.match(r.sms, /in touch about your payment/);
    assert.match(render("class_cancelled", { className: "Reformer", when: "Mon" }).sms, /back in your account/);
  });

  test("new engine refusals have their own words", () => {
    for (const k of ["waitlist_first", "code_used_up", "not_a_package", "type_locked", "moved_outside_package", "class_not_started"]) {
      assert.notEqual(friendlyError({ message: k }), "Something went wrong. Please try again.", k);
    }
  });
});

describe("cron secret (A-089)", () => {
  test("only the exact bearer secret passes (constant-time compare, any length)", () => {
    assert.equal(cronAuthorized("Bearer s3cret", "s3cret"), true);
    assert.equal(cronAuthorized("Bearer s3creT", "s3cret"), false);
    assert.equal(cronAuthorized("Bearer s3cret-longer", "s3cret"), false);
    assert.equal(cronAuthorized("", "s3cret"), false);
    assert.equal(cronAuthorized(null, "s3cret"), false);
    assert.equal(cronAuthorized("Bearer ", ""), false);
    assert.equal(cronAuthorized("Bearer undefined", undefined), false);
  });
});

describe("scheduler warning on Today (A-102)", () => {
  test("warns when it never ran on the real app, or ran over 20 minutes ago; not for a demo without a scheduler", () => {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    assert.equal(schedulerWarning(null, false), true);
    assert.equal(schedulerWarning(null, true), false);
    assert.equal(schedulerWarning(ago(25), true), true);
    assert.equal(schedulerWarning(ago(25), false), true);
    assert.equal(schedulerWarning(ago(3), false), false);
  });
});

describe("error words (A-054)", () => {
  test("every code the database raises has its own message", async () => {
    const fs = await import("node:fs");
    const dir = "supabase/migrations";
    const codes = new Set<string>();
    for (const f of fs.readdirSync(dir)) {
      for (const m of fs.readFileSync(`${dir}/${f}`, "utf8").matchAll(/raise exception '([a-z_]+)'/g)) codes.add(m[1]);
    }
    assert.ok(codes.size > 30);
    const missing = [...codes].filter((k) => friendlyError({ message: k }) === "Something went wrong. Please try again.");
    assert.deepEqual(missing, []);
  });

  test("must() turns a failed write into a friendly error, never the raw message", () => {
    assert.throws(() => must({ error: { message: "duplicate key value violates unique constraint" } }), (e: Error) => e.message === "save_failed");
    assert.throws(() => must({ error: { message: "full" } }), (e: Error) => e.message === "full");
    assert.doesNotThrow(() => must({ error: null }));
    assert.equal(friendlyError(new Error("save_failed")), "That didn't save. Please try again.");
  });
});

describe("database reads retry once (A-055)", () => {
  test("a GET that hits a dropped connection or a 503 is tried once more; a POST never is", async () => {
    const real = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = (async () => { calls++; if (calls === 1) throw new TypeError("fetch failed"); return new Response("ok"); }) as typeof fetch;
      assert.equal(await (await retryingFetch("http://x/rest/v1/a", { method: "GET" }, () => 0)).text(), "ok");
      assert.equal(calls, 2);
      calls = 0;
      globalThis.fetch = (async () => { calls++; return new Response("busy", { status: calls === 1 ? 503 : 200 }); }) as typeof fetch;
      assert.equal((await retryingFetch("http://x/rest/v1/a", undefined, () => 0)).status, 200);
      assert.equal(calls, 2);
      calls = 0;
      globalThis.fetch = (async () => { calls++; throw new TypeError("fetch failed"); }) as typeof fetch;
      await assert.rejects(retryingFetch("http://x/rest/v1/rpc/book_session", { method: "POST" }, () => 0));
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = real;
    }
  });
});
