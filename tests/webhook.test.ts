// Stripe webhook tests: signature check, credits granted once, abandoned checkout.
// Needs the app running with test-only Stripe settings, e.g.:
//   STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_test_dummy npx next start -p 3002
//   WEBHOOK_URL=http://localhost:3002/api/stripe/webhook STRIPE_WEBHOOK_SECRET=whsec_test_dummy npm run test:webhook
// No request ever reaches Stripe: events are signed locally with the test secret.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const URL_ = process.env.WEBHOOK_URL ?? "http://localhost:3002/api/stripe/webhook";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_dummy";
const stripe = new Stripe("sk_test_dummy");

async function pendingPack(tag: string) {
  const { data: p } = await db.from("profiles").insert({ full_name: `Webhook ${tag}`, email: `wh-${tag}-${Date.now()}@example.com`, onboarded_at: new Date().toISOString() }).select("id").single();
  const { data: prod } = await db.from("products").select("id, price_cents, name, credits").eq("tag", "package").eq("credit_kind", "reformer").eq("per_week", 1).eq("months", 1).single();
  const { data: pay } = await db.from("payments").insert({ profile_id: p!.id, provider: "stripe", amount_cents: prod!.price_cents, purpose: "pack", product_id: prod!.id, description: prod!.name, status: "pending" }).select("id").single();
  return { profile: p!.id, payment: pay!.id, credits: prod!.credits };
}

function event(id: string, type: string, paymentId: string, paid = true) {
  return JSON.stringify({
    id, object: "event", type, api_version: "2024-06-20", created: Math.floor(Date.now() / 1000),
    data: { object: { id: `cs_test_${id}`, object: "checkout.session", mode: "payment", customer: null, payment_status: paid ? "paid" : "unpaid", metadata: { payment_id: paymentId } } },
  });
}

async function post(payload: string, signature?: string) {
  const res = await fetch(URL_, {
    method: "POST", body: payload,
    headers: { "content-type": "application/json", "stripe-signature": signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

describe("stripe webhook", () => {
  test("rejects an event without a valid signature", async () => {
    const { payment } = await pendingPack("forged");
    const r = await post(event(`evt_forged_${Date.now()}`, "checkout.session.completed", payment), "t=1,v1=not-a-real-signature");
    assert.equal(r.status, 400);
    assert.equal((await db.from("payments").select("status").eq("id", payment).single()).data?.status, "pending");
  });

  test("a paid checkout grants the package once, even when Stripe sends it again", async () => {
    const { profile, payment, credits } = await pendingPack("paid");
    const payload = event(`evt_paid_${Date.now()}`, "checkout.session.completed", payment);
    const first = await post(payload);
    const again = await post(payload);                                   // same event delivered twice
    const other = await post(event(`evt_paid2_${Date.now()}`, "checkout.session.completed", payment)); // a second event for the same payment
    assert.deepEqual([first.status, again.status, other.status], [200, 200, 200]);
    assert.equal(again.body.duplicate, true);
    const { data: lots } = await db.from("credit_lots").select("total").eq("profile_id", profile);
    assert.deepEqual(lots?.map((l) => l.total), [credits]);
    assert.equal((await db.from("payments").select("status").eq("id", payment).single()).data?.status, "paid");
  });

  test("an abandoned (expired) checkout is marked failed and grants nothing", async () => {
    const { profile, payment } = await pendingPack("expired");
    const r = await post(event(`evt_exp_${Date.now()}`, "checkout.session.expired", payment, false));
    assert.equal(r.status, 200);
    assert.equal((await db.from("payments").select("status").eq("id", payment).single()).data?.status, "failed");
    assert.equal((await db.from("credit_lots").select("id", { count: "exact", head: true }).eq("profile_id", profile)).count, 0);
  });
});
