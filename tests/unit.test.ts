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
import { addDaysKey, dayKey, dayWord, importDateKey, localToUtc, time } from "../src/lib/time";
import { expiringNote } from "../src/lib/notifications/templates";

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

describe("calendar file (A-090)", () => {
  const base = { uid: "abc", title: "Reformer · Re·Form", start: "2027-03-28T06:00:00Z", end: "2027-03-28T06:50:00Z" };
  test("escapes ; , \\ and newlines, strips CR, folds lines at 75 octets", async () => {
    const { buildIcs } = await import("../src/lib/ics");
    const ics = buildIcs({ ...base, location: "Studio; Limassol, Cyprus", description: "Line 1\r\nLine 2 \\ end" });
    assert.ok(ics.includes("LOCATION:Studio\\; Limassol\\, Cyprus"));
    assert.ok(ics.includes("DESCRIPTION:Line 1\\nLine 2 \\\\ end"));
    const long = buildIcs({ ...base, description: "Ä".repeat(120) });
    for (const line of long.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long: ${line.length}`);
    const unfolded = long.replace(/\r\n /g, "");
    assert.ok(unfolded.includes(`DESCRIPTION:${"Ä".repeat(120)}`), "folding keeps characters whole");
    assert.ok(!/\r(?!\n)/.test(long));
  });
  test("has a SEQUENCE that grows, and STATUS:CANCELLED when cancelled", async () => {
    const { buildIcs } = await import("../src/lib/ics");
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1]);
    const a = buildIcs(base, new Date("2027-01-01T00:00:00Z"));
    const b = buildIcs(base, new Date("2027-01-02T00:00:00Z"));
    assert.ok(seq(b) > seq(a));
    assert.ok(!a.includes("STATUS:CANCELLED") && a.includes("STATUS:CONFIRMED"));
    const c = buildIcs({ ...base, cancelled: true });
    assert.ok(c.includes("STATUS:CANCELLED") && !c.includes("BEGIN:VALARM"), "a cancelled class has no reminder");
  });
});

describe("admin client search (A-091)", () => {
  test("the search term can't break or extend the PostgREST or() filter", async () => {
    const { searchTerm } = await import("../src/lib/search");
    assert.equal(searchTerm("  Elena  "), "Elena");
    assert.equal(searchTerm("a,role.eq.admin"), "a role.eq.admin");
    for (const bad of ["x)", "(y", "*", "%", "\\", '"q"', "a,b"]) assert.ok(!/[,()*%\\"]/.test(searchTerm(bad)), bad);
    assert.equal(searchTerm("+357 99"), "+357 99");
    assert.equal(searchTerm("elena@example.com"), "elena@example.com");
    assert.ok(searchTerm("x".repeat(500)).length <= 100);
  });
});

describe("photo uploads (A-093)", () => {
  test("the type comes from the file's first bytes, not the browser's label", async () => {
    const { sniffImage } = await import("../src/lib/image-type");
    const b = (...n: number[]) => new Uint8Array([...n, ...new Array(16).fill(0)]);
    assert.deepEqual(sniffImage(b(0xff, 0xd8, 0xff, 0xe0)), { ext: "jpg", type: "image/jpeg" });
    assert.deepEqual(sniffImage(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), { ext: "png", type: "image/png" });
    const webp = new Uint8Array(16); webp.set([0x52, 0x49, 0x46, 0x46], 0); webp.set([0x57, 0x45, 0x42, 0x50], 8);
    assert.deepEqual(sniffImage(webp), { ext: "webp", type: "image/webp" });
    const wav = new Uint8Array(16); wav.set([0x52, 0x49, 0x46, 0x46], 0); wav.set([0x57, 0x41, 0x56, 0x45], 8);
    assert.equal(sniffImage(wav), null, "RIFF that isn't WebP");
    assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
    assert.equal(sniffImage(new TextEncoder().encode("<html><script>")), null);
    assert.equal(sniffImage(new Uint8Array(2)), null);
  });
});

describe("Content-Security-Policy (A-043)", () => {
  test("nonce scripts, own origin only, her photos from Supabase, the click-to-load map, no plugins", async () => {
    const { buildCsp } = await import("../src/lib/csp");
    const csp = buildCsp("abc123", { supabaseUrl: "https://xyz.supabase.co", dev: false });
    const dir = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " "));
    assert.equal(dir("default-src"), "default-src 'self'");
    assert.equal(dir("script-src"), "script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    assert.ok(dir("img-src")!.includes("https://xyz.supabase.co"));
    assert.ok(dir("frame-src")!.includes("https://www.google.com"));
    assert.equal(dir("object-src"), "object-src 'none'");
    assert.equal(dir("base-uri"), "base-uri 'self'");
    assert.ok(dir("form-action")!.startsWith("form-action 'self'"));
    assert.ok(!csp.includes("unsafe-eval"));
    assert.ok(!csp.includes("frame-ancestors") && !csp.includes("upgrade-insecure-requests"), "ignored (with a console warning) in Report-Only");
    assert.ok(buildCsp("n", { supabaseUrl: "http://127.0.0.1:54321", dev: true }).includes("'unsafe-eval'"), "React needs eval in dev only");
    assert.ok(!/[\n\r]/.test(csp));
  });
});

describe("studio time (WP12: A-095, A-097, A-046, A-048)", () => {
  test("A-095: localToUtc round-trips every 30 minutes on the four clock-change days", () => {
    for (const day of ["2026-03-29", "2026-10-25", "2027-03-28", "2027-10-31"]) {
      for (let m = 0; m < 24 * 60; m += 30) {
        const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const utc = localToUtc(day, hhmm);
        const spring = day.includes("-03-");
        const gap = spring && hhmm >= "03:00" && hhmm < "04:00"; // 03:00-03:59 doesn't exist
        if (gap) { assert.equal(dayKey(utc), day); assert.ok(time(utc) >= "04:00", `${day} ${hhmm}`); continue; }
        assert.equal(dayKey(utc), day, `${day} ${hhmm}`);
        assert.equal(time(utc), hhmm, `${day} ${hhmm}`);
      }
    }
    // the 03:30 that repeats on 25 Oct / 31 Oct means the first one (summer time, 00:30 UTC)
    assert.equal(localToUtc("2026-10-25", "03:30"), "2026-10-25T00:30:00.000Z");
    assert.equal(localToUtc("2026-03-29", "02:00"), "2026-03-29T00:00:00.000Z");
    assert.equal(localToUtc("2026-03-29", "04:00"), "2026-03-29T01:00:00.000Z");
  });

  test("A-097: reminder wording follows the class day, not the clock offset", () => {
    const now = (iso: string) => new Date(iso);
    // 28 Mar 2027 18:00 local (UTC+2) is the evening before the clock change
    const nowSat = now("2027-03-27T16:00:00Z");
    assert.equal(dayWord(localToUtc("2027-03-28", "08:00"), nowSat), "Tomorrow");
    assert.equal(dayWord(localToUtc("2027-03-27", "20:00"), nowSat), "Today");
    assert.equal(dayWord(localToUtc("2027-03-29", "08:00"), nowSat), "Monday");
    // 31 Oct 2027 08:00 seen 24h before (the day before, 07:00 UTC = 09:00... clock back that night)
    assert.equal(dayWord(localToUtc("2027-10-31", "08:00"), now("2027-10-30T05:00:00Z")), "Tomorrow");
    assert.equal(dayWord(localToUtc("2027-11-01", "08:00"), now("2027-10-30T05:00:00Z")), "Monday");
    const r = render("reminder_24h", { name: "Ann", className: "Reformer", when: "Monday 29 March, 08:00", day: "Monday" });
    assert.match(r.subject, /^Monday:/);
    assert.doesNotMatch(r.subject + r.heading + (r.sms ?? ""), /omorrow/);
    assert.match(render("reminder_24h", { name: "Ann", className: "Reformer", when: "x", day: "Today" }).heading, /today/i);
    assert.match(render("reminder_24h", { name: "Ann", className: "Reformer", when: "x" }).subject, /^Tomorrow:/);
  });

  test("A-046: the expiry email names the last day, not the day after", () => {
    const expires = localToUtc("2027-04-01", "00:00"); // last valid day is 31 March
    const note = expiringNote(2, "reformer", expires);
    assert.match(note, /can be used until Wednesday 31 March/);
    assert.doesNotMatch(note, /1 April/);
    assert.match(expiringNote(1, "mat", localToUtc("2026-10-26", "00:00")), /1 mat class can be used until Sunday 25 October/);
  });

  test("A-048: import dates accept ISO, DD.MM.YYYY and DD/MM/YYYY; rubbish is rejected", () => {
    assert.equal(importDateKey("2026-12-31"), "2026-12-31");
    assert.equal(importDateKey("31.12.2026"), "2026-12-31");
    assert.equal(importDateKey("31/12/2026"), "2026-12-31");
    assert.equal(importDateKey("1/2/2027"), "2027-02-01");
    for (const bad of ["rubbish", "31.02.2026", "2026-13-01", "12/31/26", ""]) assert.equal(importDateKey(bad), null, bad);
    // end of that day, studio time: the first instant after the last valid day
    assert.equal(localToUtc(addDaysKey("2026-12-31", 1), "00:00"), "2026-12-31T22:00:00.000Z");
  });
});

describe("copy that matches the settings and the engine (WP10: A-024, A-073)", () => {
  test("the booking window in the error is the setting, not a fixed 4 weeks", () => {
    assert.match(friendlyError({ message: "beyond_window" }, { windowDays: 42 }), /6 weeks ahead/);
    assert.match(friendlyError({ message: "beyond_window" }, { windowDays: 7 }), /1 week ahead/);
    assert.doesNotMatch(friendlyError({ message: "beyond_window" }), /4 weeks/);
  });
  test("the booking note uses the class's credit cost", async () => {
    const { classesUsedNote } = await import("../src/lib/notifications/templates");
    assert.equal(classesUsedNote(1), "1 class from your package was used.");
    assert.equal(classesUsedNote(3), "3 classes from your package were used.");
  });
  test("closing line follows the class", async () => {
    const { seeYou } = await import("../src/lib/copy");
    assert.equal(seeYou("mat"), "See you on the mat.");
    assert.equal(seeYou("reformer"), "See you on the reformer.");
    assert.equal(seeYou("event"), "See you there!");
    assert.equal(seeYou("other"), "See you soon.");
  });
});

describe("class type labels in copy (A-025)", () => {
  test("expiring and low-class messages use the label, not the key", () => {
    assert.match(expiringNote(2, "Pre and post natal", "2026-12-01T22:00:00Z"), /^2 Pre and post natal classes can be used until/);
    const low = render("credits_low", { name: "Maria", className: "Pre and post natal" });
    assert.match(JSON.stringify(low), /1 Pre and post natal class left/);
  });
  test("no template string puts a credit_kind key into copy", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name)) {
          fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
            // links like /packs?type=${kind} are fine; copy is not
            if (/\$\{[^}]*(credit_kind|creditKind|\.kind)\}/.test(line) && !/(href|\?type=|redirect)/.test(line) && !line.includes("// kind-ok")) hits.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk("src");
    assert.deepEqual(hits, []);
  });
});

describe("late-cancel wording (A-028)", () => {
  test("a class 2 hours away says when free cancellation closed, as a clock time", async () => {
    const { closedAt } = await import("../src/lib/time");
    const now = new Date("2026-11-10T12:00:00Z"); // 14:00 in Nicosia
    const start = new Date(now.getTime() + 2 * 3_600_000);
    const cutoffAt = new Date(start.getTime() - 6 * 3_600_000);
    assert.equal(closedAt(cutoffAt, now), "10:00");
    assert.doesNotMatch(closedAt(cutoffAt, now), /ago|min/);
    const earlier = new Date("2026-11-11T05:00:00Z"); // class tomorrow 07:00 local; cutoff was 01:00 local today? check another day shows weekday
    assert.match(closedAt(new Date("2026-11-09T21:30:00Z"), earlier), /^[A-Z][a-z]{2} \d\d:\d\d$/);
  });
});

describe("reminder wording follows Settings (A-073)", () => {
  test("hours before class, from the minutes list", async () => {
    const { reminderWhen } = await import("../src/lib/copy");
    assert.equal(reminderWhen([1440, 120]), "24 hours and 2 hours");
    assert.equal(reminderWhen([120, 1440, 60]), "24 hours, 2 hours and 1 hour");
    assert.equal(reminderWhen([90]), "90 minutes");
  });
});

describe("config checks and safe logs (WP13: A-056, A-057)", () => {
  test("production needs the https site URL, a long cron secret, the keys and email settings; Stripe and Twilio are all-or-none", async () => {
    const { envProblems } = await import("../src/lib/env-check");
    const ok = { APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://book.example.com", CRON_SECRET: "x".repeat(32), NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", RESEND_API_KEY: "r", EMAIL_FROM: "f" };
    assert.deepEqual(envProblems(ok), []);
    assert.deepEqual(envProblems({ ...ok, APP_ENV: undefined, NEXT_PUBLIC_SITE_URL: "" }), []); // not the real app: no rules
    assert.match(envProblems({ ...ok, NEXT_PUBLIC_SITE_URL: "http://x.test" }).join(), /NEXT_PUBLIC_SITE_URL/);
    assert.match(envProblems({ ...ok, CRON_SECRET: "short" }).join(), /CRON_SECRET/);
    assert.match(envProblems({ ...ok, RESEND_API_KEY: "" }).join(), /RESEND_API_KEY/);
    assert.match(envProblems({ ...ok, STRIPE_SECRET_KEY: "sk" }).join(), /STRIPE_WEBHOOK_SECRET/);
    assert.match(envProblems({ ...ok, DEMO_ADMIN_CODE: "12ab34" }).join(), /DEMO_ADMIN_CODE/);
  });
  test("logs mask addresses and numbers", async () => {
    const { redact, safeError } = await import("../src/lib/log-safe");
    assert.equal(redact("invalid to: maria.k@example.com and +357 99 123456"), "invalid to: [email] and [number]");
    assert.match(safeError(new Error("Resend 422: bad maria@x.io")), /\[email\]/);
  });
});

describe("settings form and action arguments (WP13: A-065, A-066)", () => {
  const cur = { cancellation_cutoff_hours: 6, waitlist_window_hours: 2, waitlist_close_minutes: 60, hold_minutes: 10, rollover_max: 0, unpaid_request_expiry_hours: 48, expiry_reminder_days: 7, student_discount_pct: 10, booking_window_weeks: 4, retention_health_months: 12, retention_inactive_months: 24, retention_payments_years: 6 };
  test("her data-keeping periods: payments can't go under 6 years (owner request, 8 Nov)", async () => {
    const { parseSettingsNumbers } = await import("../src/lib/settings-form");
    const low = parseSettingsNumbers((k) => (k === "retention_payments_years" ? "3" : null), cur);
    assert.ok(!low.ok && /payments/.test(low.errors.retention_payments_years!));
    const ok = parseSettingsNumbers((k) => ({ retention_health_months: "18", retention_inactive_months: "36" })[k as string] ?? null, cur);
    assert.ok(ok.ok && ok.values.retention_health_months === 18 && ok.values.retention_inactive_months === 36 && ok.values.retention_payments_years === 6);
  });
  test("an empty box keeps the saved value; 0 hours of free cancellation is refused with the field named", async () => {
    const { parseSettingsNumbers } = await import("../src/lib/settings-form");
    const keep = parseSettingsNumbers((k) => (k === "cancellation_cutoff_hours" ? "" : null), cur);
    assert.ok(keep.ok && keep.values.cancellation_cutoff_hours === 6);
    const zero = parseSettingsNumbers((k) => (k === "cancellation_cutoff_hours" ? "0" : null), cur);
    assert.ok(!zero.ok && /Free cancellation/.test(zero.errors.cancellation_cutoff_hours!));
    const bad = parseSettingsNumbers((k) => ({ student_discount_pct: "150", hold_minutes: "abc", waitlist_close_minutes: "0" })[k as string] ?? null, cur);
    assert.ok(!bad.ok && Object.keys(bad.errors).sort().join() === "hold_minutes,student_discount_pct");
    const good = parseSettingsNumbers((k) => ({ booking_window_weeks: "13", waitlist_close_minutes: "0" })[k as string] ?? null, cur);
    assert.ok(good.ok && good.values.booking_window_weeks === 13 && good.values.waitlist_close_minutes === 0);
  });
  test("action arguments: ids must be UUIDs and modes come from a list", async () => {
    const { parse, uuid, payMethod } = await import("../src/lib/validate");
    assert.ok(parse(uuid, "5b0e2b4e-7f0c-4d3a-9c55-2f6f0b0e1a11").ok);
    assert.ok(!parse(uuid, "'; drop table x").ok);
    assert.ok(parse(payMethod, "revolut").ok);
    assert.ok(!parse(payMethod, "paypal").ok);
  });
});
