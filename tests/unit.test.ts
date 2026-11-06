// Pure TypeScript helpers (no database). Run: npm run test:unit
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ipFrom, keyHash, limitOutcome, normEmail } from "../src/lib/request-keys";
import { needsHealthConsent } from "../src/lib/health";

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
