// Booking-engine tests against the local Supabase (npx supabase start && npx supabase db reset).
// Run: npm run test:engine
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { localToUtc } from "../src/lib/time";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let reformer: string;
const H = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function client(tag: string) {
  const { data } = await db.from("profiles").insert({ full_name: `Test ${tag}`, email: `t-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`, onboarded_at: new Date().toISOString() }).select("id").single();
  return data!.id;
}
async function session(startsInMs: number, capacity = 3) {
  const { data } = await db.from("class_sessions").insert({ class_type_id: reformer, starts_at: iso(startsInMs), ends_at: iso(startsInMs + 50 * 60_000), capacity, title: "Engine test" }).select("id").single();
  return data!.id;
}
async function grant(profile: string, n: number, expiresInMs: number | null, note = "test") {
  const { data, error } = await db.rpc("grant_lot", { p_profile: profile, p_kind: "reformer", p_credits: n, p_expires: (expiresInMs == null ? null : iso(expiresInMs)) as string, p_note: note });
  assert.ifError(error);
  return data as string;
}
async function balance(profile: string) {
  const { data } = await db.rpc("credit_balance", { p_profile: profile });
  return data?.find((r) => r.credit_kind === "reformer")?.remaining ?? 0;
}
async function lotRemaining(id: string) {
  return (await db.from("credit_lots").select("remaining").eq("id", id).single()).data!.remaining;
}
const book = (p: string, s: string, mode = "credit") => db.rpc("book_session", { p_profile: p, p_session: s, p_mode: mode });

before(async () => {
  reformer = (await db.from("class_types").select("id").eq("slug", "reformer").single()).data!.id;
});

describe("credits & booking", () => {
  test("spends the oldest-expiring credits first", async () => {
    const p = await client("oldest");
    const late = await grant(p, 2, 60 * 24 * H);
    const soon = await grant(p, 2, 10 * 24 * H);
    const { error } = await book(p, await session(48 * H));
    assert.ifError(error);
    assert.equal(await lotRemaining(soon), 1);
    assert.equal(await lotRemaining(late), 2);
  });

  test("credits that expire before the class can't be used", async () => {
    const p = await client("expbefore");
    await grant(p, 1, 24 * H);
    const { error } = await book(p, await session(72 * H));
    assert.equal(error?.message, "no_credits");
  });

  test("cancel before the cutoff returns the credit to the same lot (original expiry)", async () => {
    const p = await client("cancel-early");
    const lot = await grant(p, 1, 30 * 24 * H);
    const { data } = await book(p, await session(48 * H));
    const bookingId = (data as { booking_id: string }).booking_id;
    assert.equal(await lotRemaining(lot), 0);
    const { data: res } = await db.rpc("cancel_booking", { p_booking: bookingId, p_profile: p });
    assert.equal((res as { status: string }).status, "cancelled");
    assert.equal(await lotRemaining(lot), 1);
  });

  test("cancel inside the cutoff forfeits the credit", async () => {
    const p = await client("cancel-late");
    const lot = await grant(p, 1, 30 * 24 * H);
    const { data } = await book(p, await session(3 * H));
    const { data: res } = await db.rpc("cancel_booking", { p_booking: (data as { booking_id: string }).booking_id, p_profile: p });
    assert.equal((res as { status: string }).status, "late_cancelled");
    assert.equal(await lotRemaining(lot), 0);
  });

  test("concurrent bookings never overspend credits", async () => {
    const p = await client("race");
    await grant(p, 2, 30 * 24 * H);
    const sessions = await Promise.all([1, 2, 3, 4, 5].map((i) => session((48 + i) * H)));
    const results = await Promise.all(sessions.map((s) => book(p, s)));
    assert.equal(results.filter((r) => !r.error).length, 2);
    assert.equal(await balance(p), 0);
  });

  test("concurrent bookings never exceed capacity", async () => {
    const s = await session(50 * H, 3);
    const people = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => client(`cap${i}`)));
    await Promise.all(people.map((p) => grant(p, 1, 30 * 24 * H)));
    const results = await Promise.all(people.map((p) => book(p, s)));
    assert.equal(results.filter((r) => !r.error).length, 3);
    assert.ok(results.filter((r) => r.error).every((r) => r.error!.message === "full"));
  });

  test("expiry job writes ledger expiry entries", async () => {
    const p = await client("expire");
    const lot = await grant(p, 3, 30 * 24 * H);
    // Lots can't be edited, so grant one that's already past its expiry.
    const expired = await grant(p, 2, -1000);
    await db.rpc("expire_credits");
    assert.equal(await lotRemaining(expired), 0);
    assert.equal(await lotRemaining(lot), 3);
    const { data: e } = await db.from("credit_ledger").select("delta").eq("lot_id", expired).eq("entry_type", "expiry");
    assert.deepEqual(e?.map((r) => r.delta), [-2]);
  });

  test("pay at the studio: one unpaid class at a time", async () => {
    const p = await client("paylater");
    assert.ifError((await book(p, await session(30 * H), "pay_at_studio")).error);
    assert.equal((await book(p, await session(31 * H), "pay_at_studio")).error?.message, "unpaid_limit");
  });

  test("admin adjustment requires a reason", async () => {
    const p = await client("reason");
    const { error } = await db.rpc("admin_adjust_credits", { p_profile: p, p_kind: "reformer", p_delta: 2, p_days: 30, p_reason: " ", p_actor: p });
    assert.equal(error?.message, "reason_required");
  });

  test("the ledger is append-only", async () => {
    const { error } = await db.from("credit_ledger").update({ delta: 99 }).gt("id", 0);
    assert.match(error?.message ?? "", /append-only/);
  });
});

describe("memberships", () => {
  let product: string;
  before(async () => {
    product = (await db.from("products").select("id").eq("kind", "membership").order("sort_order").limit(1).single()).data!.id;
  });

  async function startMembership(p: string) {
    const { data: pay } = await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "membership", product_id: product, description: "test", status: "pending" }).select("id").single();
    const { data } = await db.rpc("confirm_payment", { p_payment: pay!.id, p_method: "cash" });
    return { paymentId: pay!.id, membershipId: (data as { membership_id: string }).membership_id };
  }

  test("paying for a package grants the period's credits once (double confirm is idempotent)", async () => {
    const p = await client("member");
    const { paymentId } = await startMembership(p);
    assert.equal(await balance(p), 4);
    const { data } = await db.rpc("confirm_payment", { p_payment: paymentId, p_method: "cash" });
    assert.equal((data as { status: string }).status, "already_paid");
    assert.equal(await balance(p), 4);
  });

  test("renewal grant is idempotent per period (double webhook)", async () => {
    const p = await client("renew");
    const { membershipId } = await startMembership(p);
    const { data: m } = await db.from("memberships").select("current_period_end").eq("id", membershipId).single();
    const a = await db.rpc("grant_membership_period", { p_membership: membershipId, p_start: m!.current_period_end });
    const b = await db.rpc("grant_membership_period", { p_membership: membershipId, p_start: m!.current_period_end });
    assert.equal(a.data, b.data);
    const { count } = await db.from("credit_lots").select("id", { count: "exact", head: true }).eq("membership_id", membershipId);
    assert.equal(count, 2);
  });

  test("duplicate Stripe events are skipped", async () => {
    const id = `evt_test_${Date.now()}`;
    assert.ifError((await db.from("processed_webhooks").insert({ id })).error);
    assert.ok((await db.from("processed_webhooks").insert({ id })).error);
  });

  test("rollover carries at most the configured cap", async () => {
    const p = await client("rollover");
    await db.from("studio_settings").update({ rollover_max: 2 }).eq("id", 1);
    try {
      const { membershipId } = await startMembership(p); // 4 credits, none used
      const { data: m } = await db.from("memberships").select("current_period_end").eq("id", membershipId).single();
      const { data: newLot } = await db.rpc("grant_membership_period", { p_membership: membershipId, p_start: m!.current_period_end });
      assert.equal(await lotRemaining(newLot as string), 4 + 2);
    } finally {
      await db.from("studio_settings").update({ rollover_max: 0 }).eq("id", 1);
    }
  });

  test("failed payment: past-due gets no new credits until a renewal is paid", async () => {
    const p = await client("pastdue");
    const { membershipId } = await startMembership(p);
    await db.from("memberships").update({ status: "past_due" }).eq("id", membershipId);
    assert.equal(await balance(p), 4); // nothing added by the failure itself
    const { data: pay } = await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "renewal", membership_id: membershipId, product_id: product, description: "renewal", status: "pending" }).select("id").single();
    await db.rpc("confirm_payment", { p_payment: pay!.id, p_method: "cash" });
    assert.equal((await db.from("memberships").select("status").eq("id", membershipId).single()).data!.status, "active");
    assert.equal(await balance(p), 8);
  });

  test("pause then resume extends the period and its credits", async () => {
    const p = await client("pause");
    const { membershipId } = await startMembership(p);
    const before = (await db.from("memberships").select("current_period_end").eq("id", membershipId).single()).data!.current_period_end;
    await db.rpc("pause_membership", { p_membership: membershipId });
    await new Promise((r) => setTimeout(r, 1200));
    await db.rpc("resume_membership", { p_membership: membershipId });
    const afterEnd = (await db.from("memberships").select("current_period_end").eq("id", membershipId).single()).data!.current_period_end;
    assert.ok(new Date(afterEnd).getTime() - new Date(before).getTime() >= 1000);
    const { data: lot } = await db.from("credit_lots").select("expires_at").eq("membership_id", membershipId).single();
    assert.equal(new Date(lot!.expires_at!).getTime(), new Date(afterEnd).getTime());
  });
});

describe("time & DST (Cyprus clocks go back on 25 Oct 2026)", () => {
  test("08:00 local stays 08:00 across the change (UTC shifts by an hour)", () => {
    assert.equal(localToUtc("2026-10-24", "08:00"), "2026-10-24T05:00:00.000Z");
    assert.equal(localToUtc("2026-10-26", "08:00"), "2026-10-26T06:00:00.000Z");
    assert.equal(localToUtc("2026-03-28", "08:00"), "2026-03-28T06:00:00.000Z");
    assert.equal(localToUtc("2026-03-30", "08:00"), "2026-03-30T05:00:00.000Z");
  });

  test("timetable generation keeps local times across the change", async () => {
    const { data: t } = await db.from("timetable_templates").insert({ name: "DST test", valid_from: "2026-10-24", valid_to: "2026-10-26" }).select("id").single();
    for (const wd of [1, 6, 7]) await db.from("template_slots").insert({ template_id: t!.id, weekday: wd, start_time: "08:00", class_type_id: reformer });
    await db.rpc("generate_sessions", { p_template: t!.id });
    const { data } = await db.from("class_sessions").select("starts_at").eq("template_id", t!.id).order("starts_at");
    const local = (data ?? []).map((r) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(r.starts_at)));
    // Only classes still in the future are generated; every one must be at 08:00 local.
    assert.ok(local.every((t) => t === "08:00"), local.join(","));
  });

  test("ledger and cached balances agree for every lot", async () => {
    const { data: lots } = await db.from("credit_lots").select("id, remaining");
    const { data: ledger } = await db.from("credit_ledger").select("lot_id, delta");
    const sums = new Map<string, number>();
    for (const e of ledger ?? []) if (e.lot_id) sums.set(e.lot_id, (sums.get(e.lot_id) ?? 0) + e.delta);
    for (const l of lots ?? []) assert.equal(sums.get(l.id) ?? 0, l.remaining, `lot ${l.id}`);
  });
});

// Leave the local database as a clean demo for the e2e tests.
after(async () => {
  await db.rpc("reset_demo_data");
});
