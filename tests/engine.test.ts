// Booking-engine tests against the local Supabase (npx supabase start && npx supabase db reset).
// Run: npm run test:engine
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import postgres from "postgres";
import { addDaysKey, localToUtc, todayKey } from "../src/lib/time";
import { productPrice } from "../src/lib/pricing";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let reformer: string;
const H = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function client(tag: string) {
  const { data } = await db.from("profiles").insert({ full_name: `Test ${tag}`, email: `t-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`, onboarded_at: new Date().toISOString() }).select("id").single();
  return data!.id;
}
/** A clients-only event (only events can be clients-only). */
async function clientsOnlyEvent(startsInMs: number, capacity = 3) {
  const type = (await db.from("class_types").select("id").eq("kind", "event").limit(1).single()).data!.id;
  const { data } = await db.from("class_sessions").insert({ class_type_id: type, starts_at: iso(startsInMs), ends_at: iso(startsInMs + 90 * 60_000), capacity, title: "Engine event", clients_only: true }).select("id").single();
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
const book = (p: string, s: string, mode = "credit", source: "online" | "manual" = "online", method?: string) =>
  db.rpc("book_session", { p_profile: p, p_session: s, p_mode: mode, p_source: source, p_method: method });
// Beyond the 4-week online window: the studio adds the booking (same credit rules apply).
const bookFar = (p: string, s: string) => book(p, s, "credit", "manual");

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
    assert.equal(error?.message, "beyond_expiry");
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

  test("pay at the studio is off by default (pay in advance); when enabled, one unpaid class at a time", async () => {
    const p = await client("paylater");
    assert.equal((await book(p, await session(30 * H), "pay_at_studio")).error?.message, "pay_later_off");
    await db.from("studio_settings").update({ allow_pay_later: true }).eq("id", 1);
    try {
      assert.ifError((await book(p, await session(31 * H), "pay_at_studio")).error);
      assert.equal((await book(p, await session(32 * H), "pay_at_studio")).error?.message, "unpaid_limit");
    } finally {
      await db.from("studio_settings").update({ allow_pay_later: false }).eq("id", 1);
    }
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
  let perPeriod: number;
  before(async () => {
    const row = (await db.from("products").select("id, credits").eq("kind", "membership").order("sort_order").limit(1).single()).data!;
    product = row.id;
    perPeriod = row.credits;
  });

  async function startMembership(p: string) {
    const { data: pay } = await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "membership", product_id: product, description: "test", status: "pending" }).select("id").single();
    const { data } = await db.rpc("confirm_payment", { p_payment: pay!.id, p_method: "cash" });
    return { paymentId: pay!.id, membershipId: (data as { membership_id: string }).membership_id };
  }

  test("paying for a package grants the period's credits once (double confirm is idempotent)", async () => {
    const p = await client("member");
    const { paymentId } = await startMembership(p);
    assert.equal(await balance(p), perPeriod);
    const { data } = await db.rpc("confirm_payment", { p_payment: paymentId, p_method: "cash" });
    assert.equal((data as { status: string }).status, "already_paid");
    assert.equal(await balance(p), perPeriod);
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
      const { membershipId } = await startMembership(p); // none used
      const { data: m } = await db.from("memberships").select("current_period_end").eq("id", membershipId).single();
      const { data: newLot } = await db.rpc("grant_membership_period", { p_membership: membershipId, p_start: m!.current_period_end });
      assert.equal(await lotRemaining(newLot as string), perPeriod + 2);
    } finally {
      await db.from("studio_settings").update({ rollover_max: 0 }).eq("id", 1);
    }
  });

  test("failed payment: past-due gets no new credits until a renewal is paid", async () => {
    const p = await client("pastdue");
    const { membershipId } = await startMembership(p);
    await db.from("memberships").update({ status: "past_due" }).eq("id", membershipId);
    assert.equal(await balance(p), perPeriod); // nothing added by the failure itself
    const { data: pay } = await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "renewal", membership_id: membershipId, product_id: product, description: "renewal", status: "pending" }).select("id").single();
    await db.rpc("confirm_payment", { p_payment: pay!.id, p_method: "cash" });
    assert.equal((await db.from("memberships").select("status").eq("id", membershipId).single()).data!.status, "active");
    assert.equal(await balance(p), perPeriod * 2);
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

describe("studio policy", () => {
  const D = 24 * H;
  async function packLot(p: string, n: number, validity: number) {
    const { data, error } = await db.rpc("grant_lot", { p_profile: p, p_kind: "reformer", p_credits: n, p_expires: null as unknown as string, p_note: "pack", p_validity_days: validity });
    assert.ifError(error);
    return data as string;
  }
  const lot = async (id: string) => (await db.from("credit_lots").select("started_at, expires_at, remaining").eq("id", id).single()).data!;
  const localDate = (isoStr: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(new Date(isoStr));

  test("cancellation cutoff is 6 hours", async () => {
    const cfg = (await db.from("studio_settings").select("cancellation_cutoff_hours").single()).data!;
    assert.equal(cfg.cancellation_cutoff_hours, 6);
    const p = await client("six");
    await grant(p, 2, 30 * D);
    const early = (await book(p, await session(7 * H))).data as { booking_id: string };
    const late = (await book(p, await session(5 * H))).data as { booking_id: string };
    assert.equal(((await db.rpc("cancel_booking", { p_booking: early.booking_id, p_profile: p })).data as { status: string }).status, "cancelled");
    assert.equal(((await db.rpc("cancel_booking", { p_booking: late.booking_id, p_profile: p })).data as { status: string }).status, "late_cancelled");
  });

  test("6h cutoff is real elapsed time across the clock change", () => {
    // Class 25 Oct 2026 08:00 Cyprus (after clocks go back, UTC+2): 06:00Z. Cutoff 6h earlier = 00:00Z,
    // which is 03:00 local *before* the change (UTC+3). Exactly 6 real hours, not 6 wall-clock hours.
    const start = new Date(localToUtc("2026-10-25", "08:00"));
    const cutoff = new Date(start.getTime() - 6 * H);
    assert.equal(start.toISOString(), "2026-10-25T06:00:00.000Z");
    assert.equal(cutoff.toISOString(), "2026-10-25T00:00:00.000Z");
    assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(cutoff), "03:00");
  });

  test("validity starts at the first class and recalculates when it's cancelled", async () => {
    const p = await client("validity");
    const id = await packLot(p, 4, 30);
    assert.equal((await lot(id)).started_at, null);                       // not yet started
    const first = (await book(p, await session(10 * D))).data as { booking_id: string };
    const second = (await book(p, await session(20 * D))).data as { booking_id: string };
    const a = await lot(id);
    assert.equal(localDate(a.expires_at!), addDaysKey(localDate(a.started_at!), 30));
    assert.equal(localDate(a.started_at!), localDate(iso(10 * D)));
    await db.rpc("cancel_booking", { p_booking: first.booking_id, p_profile: p });
    const b = await lot(id);
    assert.equal(localDate(b.started_at!), localDate(iso(20 * D)));        // moved to the next earliest class
    await db.rpc("cancel_booking", { p_booking: second.booking_id, p_profile: p });
    assert.equal((await lot(id)).started_at, null);                       // back to not started
  });

  test("classes beyond the package expiry can't be booked", async () => {
    const p = await client("beyond");
    await packLot(p, 4, 30);
    assert.ifError((await book(p, await session(10 * D))).error);
    assert.equal((await bookFar(p, await session(45 * D))).error?.message, "beyond_expiry");
    // An earlier class that would pull the expiry before an existing booking is refused too.
    const q = await client("beyond2");
    await packLot(q, 4, 30);
    assert.ifError((await book(q, await session(20 * D))).error);
    assert.ifError((await bookFar(q, await session(45 * D))).error);       // start 20d → expiry 50d
    assert.equal((await book(q, await session(12 * D))).error?.message, "beyond_expiry");
  });

  test("closures freeze packages, counting overlapping closures once", async () => {
    const p = await client("freeze");
    const id = await packLot(p, 4, 30);
    await bookFar(p, await session(200 * D));
    const before = await lot(id);
    const start = localDate(before.started_at!);
    const ids: string[] = [];
    try {
      const c1 = (await db.from("closures").insert({ name: "Test break A", starts_on: addDaysKey(start, 5), ends_on: addDaysKey(start, 9) }).select("id").single()).data!.id;
      ids.push(c1);
      await db.rpc("apply_closure", { p_closure: c1 });
      const afterA = await lot(id);
      assert.equal(localDate(afterA.expires_at!), addDaysKey(start, 30 + 5));
      // Second closure overlaps 2 days of the first and adds 2 new ones → +2 more.
      const c2 = (await db.from("closures").insert({ name: "Test break B", starts_on: addDaysKey(start, 8), ends_on: addDaysKey(start, 11) }).select("id").single()).data!.id;
      ids.push(c2);
      await db.rpc("apply_closure", { p_closure: c2 });
      const afterB = await lot(id);
      assert.equal(localDate(afterB.expires_at!), addDaysKey(start, 30 + 7));
      const { data: entries } = await db.from("credit_ledger").select("entry_type, delta").eq("lot_id", id).eq("entry_type", "freeze_extension");
      assert.equal(entries?.length, 2);
      // Booking on a closure day is refused.
      const closedDay = await (async () => {
        const { data } = await db.from("class_sessions").insert({ class_type_id: reformer, starts_at: localToUtc(addDaysKey(start, 6), "09:00"), ends_at: localToUtc(addDaysKey(start, 6), "09:50"), capacity: 3, title: "Engine test" }).select("id").single();
        return data!.id;
      })();
      // The studio can still add someone manually.
      assert.equal((await db.rpc("book_session", { p_profile: await client("closed"), p_session: closedDay, p_mode: "manual", p_source: "manual" })).error, null);
      // Inside the booking window, a closure day refuses online bookings.
      const near = addDaysKey(localDate(new Date().toISOString()), 10);
      const c3 = (await db.from("closures").insert({ name: "Test break C", starts_on: near, ends_on: near, confirmed: true }).select("id").single()).data!.id;
      ids.push(c3);
      const nearClass = (await db.from("class_sessions").insert({ class_type_id: reformer, starts_at: localToUtc(near, "21:30"), ends_at: localToUtc(near, "22:20"), capacity: 3, title: "Engine test" }).select("id").single()).data!.id;
      const someone = await client("closed2");
      await grant(someone, 1, 400 * D);
      assert.equal((await book(someone, nearClass)).error?.message, "studio_closed");
    } finally {
      await db.from("closures").delete().in("id", ids);
    }
  });

  test("student discount: group packages only, and only while verified", () => {
    const cfg = { student_discount_pct: 10 };
    const group = { price_cents: 14000, is_group: true, kind: "pack" };
    const priv = { price_cents: 14000, is_group: false, kind: "pack" };
    const future = addDaysKey(todayKey(), 30), past = addDaysKey(todayKey(), -1);
    assert.deepEqual(productPrice(group, { student_verified_until: future }, cfg), { cents: 12600, student: true });
    assert.deepEqual(productPrice(group, { student_verified_until: past }, cfg), { cents: 14000, student: false });
    assert.deepEqual(productPrice(group, { student_verified_until: null }, cfg), { cents: 14000, student: false });
    assert.deepEqual(productPrice(priv, { student_verified_until: future }, cfg), { cents: 14000, student: false });
  });

  test("unpaid package requests expire after the configured hours", async () => {
    const p = await client("unpaid");
    const product = (await db.from("products").select("id").eq("kind", "pack").limit(1).single()).data!.id;
    const old = (await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "pack", product_id: product, description: "old", status: "pending", created_at: iso(-49 * H) }).select("id").single()).data!.id;
    const fresh = (await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "pack", product_id: product, description: "fresh", status: "pending", created_at: iso(-2 * H) }).select("id").single()).data!.id;
    await db.rpc("expire_unpaid_requests");
    assert.equal((await db.from("payments").select("status").eq("id", old).single()).data!.status, "cancelled");
    assert.equal((await db.from("payments").select("status").eq("id", fresh).single()).data!.status, "pending");
    // An expired request can't be marked paid by mistake.
    assert.equal((await db.rpc("confirm_payment", { p_payment: old, p_method: "cash" })).error?.message, "payment_cancelled");
  });

  test("a paid package grants classes that start on the first class", async () => {
    const p = await client("packpaid");
    const product = (await db.from("products").select("id, credits, validity_days").eq("kind", "pack").not("validity_days", "is", null).limit(1).single()).data!;
    const pay = (await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "pack", product_id: product.id, description: "pack", status: "pending" }).select("id").single()).data!.id;
    await db.rpc("confirm_payment", { p_payment: pay, p_method: "revolut" });
    const { data: l } = await db.from("credit_lots").select("validity_days, started_at, expires_at, remaining").eq("payment_id", pay).single();
    assert.equal(l!.validity_days, product.validity_days);
    assert.equal(l!.started_at, null);
    assert.equal(l!.remaining, product.credits);
    assert.equal((await db.from("payments").select("method").eq("id", pay).single()).data!.method, "revolut");
  });
});

// Leave the local database as a clean demo for the e2e tests.
after(async () => {
  await db.rpc("reset_demo_data");
});

describe("client notes, round 1", () => {
  const D = 86_400_000;
  test("online bookings open 4 weeks ahead; the studio can add beyond that", async () => {
    const p = await client("window");
    await grant(p, 2, null);
    assert.equal((await book(p, await session(35 * D))).error?.message, "beyond_window");
    assert.ifError((await book(p, await session(20 * D))).error);
    assert.ifError((await bookFar(p, await session(35 * D))).error);
  });

  test("trial: once per class type, then drop-in; both reserve with an unpaid payment and the chosen method", async () => {
    const p = await client("trial");
    const r = await book(p, await session(3 * D), "trial", "online", "revolut");
    assert.ifError(r.error);
    const bookingId = (r.data as { booking_id: string }).booking_id;
    const { data: pay } = await db.from("payments").select("status, amount_cents, intended_method, products(tag)").eq("booking_id", bookingId).single();
    assert.equal(pay?.status, "pending");
    assert.equal(pay?.intended_method, "revolut");
    assert.equal(pay?.products?.tag, "trial");
    // A second trial is refused; one unpaid class at a time.
    assert.equal((await book(p, await session(4 * D), "trial")).error?.message, "trial_used");
    assert.equal((await book(p, await session(4 * D), "drop_in")).error?.message, "unpaid_limit");
    // Once she marks it paid, a drop-in is fine.
    const { data: payRow } = await db.from("payments").select("id").eq("booking_id", bookingId).single();
    assert.ifError((await db.rpc("confirm_payment", { p_payment: payRow!.id, p_provider_ref: undefined as unknown as string, p_method: "revolut" })).error);
    const d = await book(p, await session(5 * D), "drop_in", "online", "cash");
    assert.ifError(d.error);
    const { data: dp } = await db.from("payments").select("amount_cents, products(tag)").eq("booking_id", (d.data as { booking_id: string }).booking_id).single();
    assert.equal(dp?.products?.tag, "drop_in");
  });

  test("someone who already took a class can't book a trial", async () => {
    const p = await client("notrial");
    await grant(p, 1, null);
    assert.ifError((await book(p, await session(2 * D))).error);
    assert.equal((await book(p, await session(3 * D), "trial")).error?.message, "trial_used");
  });

  test("cancelling an unpaid trial in time cancels its payment, so the trial is free again; a late cancel keeps it", async () => {
    const p = await client("trialcancel");
    const r = await book(p, await session(3 * D), "trial", "online", "cash");
    const bid = (r.data as { booking_id: string }).booking_id;
    assert.ifError((await db.rpc("cancel_booking", { p_booking: bid, p_profile: p })).error);
    const { data: pay } = await db.from("payments").select("id, status").eq("booking_id", bid).single();
    assert.equal(pay?.status, "cancelled");
    // Marking that request paid can't silently re-book the cancelled class.
    assert.equal((await db.rpc("confirm_payment", { p_payment: pay!.id, p_provider_ref: undefined as unknown as string, p_method: "cash" })).error?.message, "payment_cancelled");
    assert.ifError((await book(p, await session(4 * D), "trial", "online", "cash")).error);

    const q = await client("latecancel");
    const late = await book(q, await session(2 * 3_600_000), "drop_in", "online", "cash");
    const lid = (late.data as { booking_id: string }).booking_id;
    await db.rpc("cancel_booking", { p_booking: lid, p_profile: q });
    assert.equal((await db.from("payments").select("status").eq("booking_id", lid).single()).data?.status, "pending");
  });

  test("a studio-cancelled class cancels its unpaid drop-in payment", async () => {
    const p = await client("studiocancel");
    const sid = await session(5 * D);
    const r = await book(p, sid, "drop_in", "online", "revolut");
    const bid = (r.data as { booking_id: string }).booking_id;
    assert.ifError((await db.rpc("cancel_session", { p_session: sid, p_reason: "test" })).error);
    assert.equal((await db.from("payments").select("status").eq("booking_id", bid).single()).data?.status, "cancelled");
  });

  test("erasing a profile clears the round-1 personal fields and weekly rules", async () => {
    const p = await client("erase");
    await db.from("profiles").update({ first_name: "A", last_name: "B", date_of_birth: "1990-01-01", goal: "x", emergency_contact_name: "C", emergency_contact_phone: "+357 99 000000", photo_consent: "face" }).eq("id", p);
    await db.from("recurring_rules").insert({ profile_id: p, class_type_id: reformer, weekday: 1, start_time: "18:00" });
    assert.ifError((await db.rpc("erase_profile", { p_profile: p })).error);
    const { data: row } = await db.from("profiles").select("first_name, last_name, date_of_birth, goal, emergency_contact_name, emergency_contact_phone, photo_consent").eq("id", p).single();
    assert.deepEqual(Object.values(row!).filter((v) => v !== null), []);
    assert.equal((await db.from("recurring_rules").select("id", { count: "exact", head: true }).eq("profile_id", p)).count, 0);
  });
});

describe("waitlist", () => {
  const D = 86_400_000;
  const H = 3_600_000;
  const waitFor = async (startsIn: number, waiterCredits: number) => {
    const sid = await session(startsIn, 1);
    const a = await client("wl-a"); await grant(a, 1, null);
    const ra = await book(a, sid);
    assert.ifError(ra.error);
    const b = await client("wl-b");
    if (waiterCredits) await grant(b, waiterCredits, null);
    assert.ifError((await db.rpc("join_waitlist", { p_profile: b, p_session: sid })).error);
    // A frees the spot; the same call moves the waitlist up and returns who to tell (A-005).
    const { data, error } = await db.rpc("cancel_booking", { p_booking: (ra.data as { booking_id: string }).booking_id, p_profile: a, p_admin: true });
    assert.ifError(error);
    return { sid, b, rows: (data as { offers: { profile_id: string; offer_expires_at: string | null }[] }).offers };
  };

  test("a spot that opens more than 1h before class books the first in line who has a class", async () => {
    const { sid, b, rows } = await waitFor(3 * D, 2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].profile_id, b);
    assert.equal(rows[0].offer_expires_at, null);
    const { data: bk } = await db.from("bookings").select("status, paid_with").eq("session_id", sid).eq("profile_id", b).single();
    assert.deepEqual(bk, { status: "confirmed", paid_with: "credit" });
    const { data: lots } = await db.from("credit_lots").select("remaining").eq("profile_id", b);
    assert.equal(lots?.[0].remaining, 1);
    assert.equal((await db.from("waitlist_entries").select("status").eq("session_id", sid).eq("profile_id", b).single()).data?.status, "claimed");
  });

  test("without a usable class, the first in line gets a held offer instead", async () => {
    const { sid, b, rows } = await waitFor(3 * D, 0);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].offer_expires_at);
    assert.equal((await db.from("waitlist_entries").select("status").eq("session_id", sid).eq("profile_id", b).single()).data?.status, "offered");
    // The offer reserves the spot: someone else can't take it.
    const c = await client("wl-c"); await grant(c, 1, null);
    assert.equal((await book(c, sid)).error?.message, "full");
  });

  test("inside the 6h cutoff they're still booked in, and the usual cancellation rules apply (her answer: no grace period)", async () => {
    const { sid, b, rows } = await waitFor(3 * H, 2);
    assert.equal(rows[0].profile_id, b);
    assert.equal(rows[0].offer_expires_at, null);
    const { data: bk } = await db.from("bookings").select("id, free_cancel_until").eq("session_id", sid).eq("profile_id", b).eq("status", "confirmed").single();
    assert.equal(bk!.free_cancel_until, null);
    const { data: res } = await db.rpc("cancel_booking", { p_booking: bk!.id, p_profile: b, p_admin: false });
    assert.notEqual((res as { status: string }).status, "cancelled"); // a late cancel: the class isn't returned
  });

  test("in the last hour before class nobody is moved in", async () => {
    const { rows } = await waitFor(50 * 60_000, 2);
    assert.equal(rows.length, 0);
  });

  test("without a package class, the held offer ends 1 hour before class", async () => {
    const { rows } = await waitFor(90 * 60_000, 0);
    assert.ok(rows[0].offer_expires_at);
    assert.ok(new Date(rows[0].offer_expires_at!).getTime() <= Date.now() + 31 * 60_000);
  });
});


describe("rate limits", () => {
  test("allows up to the limit, then refuses, per kind and key", async () => {
    const key = `test-${Date.now()}`;
    const hit = async (k = key) => (await db.rpc("rate_limited", { p_kind: "test", p_key: k, p_max: 3, p_window_minutes: 15 })).data;
    assert.deepEqual([await hit(), await hit(), await hit(), await hit(), await hit()], [false, false, false, true, true]);
    assert.equal(await hit(`${key}-other`), false);
  });
});

describe("trials by phone", () => {
  test("a second account with the same phone number (any format) can't take another trial", async () => {
    const D = 86_400_000;
    const a = await client("phone-a");
    await db.from("profiles").update({ phone: "+357 99 123 987" }).eq("id", a);
    assert.ifError((await book(a, await session(3 * D), "trial", "online", "cash")).error);
    const b = await client("phone-b");
    await db.from("profiles").update({ phone: "99123987" }).eq("id", b);
    assert.equal((await book(b, await session(4 * D), "trial")).error?.message, "trial_used");
    assert.equal((await db.rpc("trial_eligible", { p_profile: b, p_kind: "reformer" })).data, false);
    // A different number is still eligible; mat trials are separate.
    const c = await client("phone-c");
    await db.from("profiles").update({ phone: "+357 96 000 111" }).eq("id", c);
    assert.equal((await db.rpc("trial_eligible", { p_profile: c, p_kind: "reformer" })).data, true);
    assert.equal((await db.rpc("trial_eligible", { p_profile: b, p_kind: "mat" })).data, true);
  });
});


describe("clients-only events", () => {
  test("new people can't book or join the waitlist online; clients can; the studio can add anyone", async () => {
    const s = await clientsOnlyEvent(48 * H, 1);
    const stranger = await client("co-new");
    assert.equal((await book(stranger, s, "drop_in", "online", "cash")).error?.message, "clients_only");
    const regular = await client("co-client");
    await grant(regular, 4, null);
    assert.ifError((await book(regular, s, "drop_in", "online", "cash")).error);
    // Now full: the waitlist is clients-only too.
    assert.equal((await db.rpc("join_waitlist", { p_profile: stranger, p_session: s })).error?.message, "clients_only");
    assert.notEqual((await book(stranger, s, "drop_in", "manual", "cash")).error?.message, "clients_only");
  });

  test("the flag on a regular class is ignored (only events can be clients-only)", async () => {
    const s = await session(48 * H);
    await db.from("class_sessions").update({ clients_only: true }).eq("id", s);
    const stranger = await client("co-regular");
    assert.ifError((await book(stranger, s, "trial", "online", "cash")).error);
  });
});

describe("studio notes, round 1", () => {
  const ledgerSum = async (lot: string) =>
    ((await db.from("credit_ledger").select("delta").eq("lot_id", lot)).data ?? []).reduce((n, e) => n + e.delta, 0);
  const adjust = (lot: string, action: string, o: { days?: number; date?: string; credits?: number } = {}) =>
    db.rpc("admin_adjust_lot", { p_lot: lot, p_action: action, p_days: o.days ?? 0, p_date: (o.date ?? null) as string, p_credits: o.credits ?? 0, p_reason: "test", p_actor: null as unknown as string });

  test("adjust a package: extend, freeze, add, remove, end earlier; the ledger stays in step", async () => {
    const p = await client("adjust");
    const lot = await grant(p, 4, 10 * 24 * H);
    const exp0 = new Date((await db.from("credit_lots").select("expires_at").eq("id", lot).single()).data!.expires_at!).getTime();
    assert.ifError((await adjust(lot, "extend", { days: 5 })).error);
    assert.equal((await adjust(lot, "freeze", { days: 2 })).error?.message, "bad_days"); // a freeze needs its dates
    assert.ifError((await adjust(lot, "freeze", { days: 2, date: addDaysKey(todayKey(), 1) })).error);
    const exp1 = new Date((await db.from("credit_lots").select("expires_at").eq("id", lot).single()).data!.expires_at!).getTime();
    assert.equal(Math.round((exp1 - exp0) / 86_400_000), 7);
    assert.ifError((await adjust(lot, "add", { credits: 2 })).error);
    assert.ifError((await adjust(lot, "remove", { credits: 1 })).error);
    assert.equal(await lotRemaining(lot), 5);
    assert.equal(await ledgerSum(lot), 5);
    assert.equal((await adjust(lot, "remove", { credits: 9 })).error?.message, "not_enough_credits");
    // A class booked in 3 days blocks ending the package tomorrow.
    assert.ifError((await book(p, await session(3 * 24 * H))).error);
    assert.equal((await adjust(lot, "end", { date: addDaysKey(todayKey(), 1) })).error?.message, "booked_after");
    assert.ifError((await adjust(lot, "end", { date: addDaysKey(todayKey(), 5) })).error);
    assert.equal(await ledgerSum(lot), await lotRemaining(lot));
  });

  test("the timetable repeats by itself, and a new one takes over from its start date", async () => {
    const t0 = todayKey();
    const mk = async (from: string, to: string, time: string) => {
      const { data } = await db.from("timetable_templates").insert({ name: `test ${time}`, valid_from: from, valid_to: to, repeats: true }).select("id").single();
      await db.from("template_slots").insert([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ template_id: data!.id, weekday, start_time: time, class_type_id: reformer })));
      return data!.id;
    };
    const a = await mk(t0, addDaysKey(t0, 3), "05:05");
    await db.rpc("generate_sessions", { p_template: a });
    await db.rpc("extend_timetable", {});
    const tA = (await db.from("timetable_templates").select("valid_to").eq("id", a).single()).data!;
    assert.ok(tA.valid_to >= addDaysKey(t0, 62), `extended to ${tA.valid_to}`);
    const far = await db.from("class_sessions").select("id", { count: "exact", head: true }).eq("template_id", a).gte("starts_at", localToUtc(addDaysKey(t0, 50), "00:00"));
    assert.ok((far.count ?? 0) >= 7);

    // Someone books a class from the old timetable after the switch date: it's kept.
    const start = addDaysKey(t0, 45);
    const { data: keep } = await db.from("class_sessions").select("id").eq("template_id", a).gte("starts_at", localToUtc(addDaysKey(start, 1), "00:00")).order("starts_at").limit(1).single();
    const p = await client("tt");
    await grant(p, 2, null);
    assert.ifError((await bookFar(p, keep!.id)).error);
    const b = await mk(start, addDaysKey(start, 62), "05:35");
    const { data: kept } = await db.rpc("replace_timetable_from", { p_template: b });
    assert.equal(kept, 1);
    const left = await db.from("class_sessions").select("id").eq("template_id", a).gte("starts_at", localToUtc(start, "00:00"));
    assert.deepEqual((left.data ?? []).map((s) => s.id), [keep!.id]);
    assert.equal((await db.from("timetable_templates").select("repeats").eq("id", a).single()).data!.repeats, false);
  });
});

describe("clients-only events: who can see them", () => {
  test("an active package counts, a trial or an ended package doesn't; the studio can add someone", async () => {
    const s = await clientsOnlyEvent(72 * H, 5);
    const can = async (p: string) => (await db.rpc("can_access_event", { p_profile: p, p_session: s })).data;
    const active = await client("acc-active"); await grant(active, 2, 20 * 24 * H);
    const ended = await client("acc-ended"); const lot = await grant(ended, 1, 20 * 24 * H);
    await db.rpc("admin_adjust_lot", { p_lot: lot, p_action: "remove", p_days: 0, p_date: null as unknown as string, p_credits: 1, p_reason: "test", p_actor: null as unknown as string });
    const trial = await client("acc-trial");
    assert.ifError((await book(trial, await session(30 * H), "trial", "online", "cash")).error);
    assert.equal(await can(active), true);
    assert.equal(await can(ended), false);
    assert.equal(await can(trial), false);
    await db.from("event_access").insert({ session_id: s, profile_id: trial });
    assert.equal(await can(trial), true);
    assert.equal((await book(ended, s, "drop_in", "online", "cash")).error?.message, "clients_only");
    const admin = (await db.from("profiles").insert({ full_name: "Test admin", email: `t-admin-${Date.now()}@example.com`, role: "admin" }).select("id").single()).data!.id;
    assert.equal(await can(admin), true, "the studio sees every event");
  });
});

describe("repeating timetable keeps her changes", () => {
  test("a class she cancelled or moved doesn't come back when the timetable tops itself up", async () => {
    const t0 = todayKey();
    const { data: tpl } = await db.from("timetable_templates").insert({ name: "keep changes", valid_from: t0, valid_to: addDaysKey(t0, 4), repeats: true }).select("id").single();
    await db.from("template_slots").insert([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ template_id: tpl!.id, weekday, start_time: "04:10", class_type_id: reformer })));
    await db.rpc("generate_sessions", { p_template: tpl!.id });
    const at = (k: string) => localToUtc(k, "04:10");
    const day2 = addDaysKey(t0, 2), day3 = addDaysKey(t0, 3);
    const s2 = (await db.from("class_sessions").select("id").eq("template_id", tpl!.id).eq("starts_at", at(day2)).single()).data!.id;
    const s3 = (await db.from("class_sessions").select("id").eq("template_id", tpl!.id).eq("starts_at", at(day3)).single()).data!.id;
    await db.from("class_sessions").update({ status: "cancelled" }).eq("id", s2);
    await db.from("class_sessions").update({ starts_at: localToUtc(day3, "04:40"), ends_at: localToUtc(day3, "05:30") }).eq("id", s3);
    await db.rpc("extend_timetable", {});
    const live = async (k: string) => (await db.from("class_sessions").select("id", { count: "exact", head: true }).eq("class_type_id", reformer).eq("starts_at", at(k)).eq("status", "scheduled")).count;
    assert.equal(await live(day2), 0, "cancelled class came back");
    assert.equal(await live(day3), 0, "moved class came back at the old time");
    assert.ok(((await db.from("class_sessions").select("id", { count: "exact", head: true }).eq("template_id", tpl!.id).gte("starts_at", at(addDaysKey(t0, 30)))).count ?? 0) > 0, "new weeks were added");
  });
});

describe("her notes, round 4", () => {
  const adjust = (lot: string, action: string, o: { days?: number; date?: string; credits?: number } = {}) =>
    db.rpc("admin_adjust_lot", { p_lot: lot, p_action: action, p_days: o.days ?? 0, p_date: (o.date ?? null) as string, p_credits: o.credits ?? 0, p_reason: "test", p_actor: null as unknown as string });
  /** A class at 10:00 studio time, n days from today. */
  const on = (days: number, type = reformer, price?: number) => {
    const start = localToUtc(addDaysKey(todayKey(), days), "10:00");
    return db.from("class_sessions").insert({ class_type_id: type, starts_at: start, ends_at: new Date(Date.parse(start) + 50 * 60_000).toISOString(), capacity: 3, title: "Round 4", ...(price == null ? {} : { price_cents: price }) })
      .select("id").single().then((r) => r.data!.id);
  };

  test("a freeze blocks bookings with that package only between its dates", async () => {
    const p = await client("r4-freeze");
    const lot = await grant(p, 4, 30 * 24 * H);
    assert.ifError((await adjust(lot, "freeze", { date: addDaysKey(todayKey(), 2), days: 2 })).error);
    assert.equal((await book(p, await on(2))).error?.message, "package_frozen");
    assert.equal((await book(p, await on(3))).error?.message, "package_frozen");
    assert.ifError((await book(p, await on(1))).error);
    assert.ifError((await book(p, await on(4))).error);
    const { data: f } = await db.from("lot_freezes").select("starts_on, ends_on").eq("lot_id", lot).single();
    assert.deepEqual(f, { starts_on: addDaysKey(todayKey(), 2), ends_on: addDaysKey(todayKey(), 3) });
  });

  test("a freeze over days they're already booked is refused", async () => {
    const p = await client("r4-freeze-booked");
    const lot = await grant(p, 4, 30 * 24 * H);
    assert.ifError((await book(p, await on(6))).error);
    assert.equal((await adjust(lot, "freeze", { date: addDaysKey(todayKey(), 5), days: 3 })).error?.message, "booked_in_freeze");
    assert.ifError((await adjust(lot, "freeze", { date: addDaysKey(todayKey(), 7), days: 3 })).error);
  });

  test("free bookings online only for €0 events", async () => {
    const event = (await db.from("class_types").select("id").eq("kind", "event").limit(1).single()).data!.id;
    const p = await client("r4-free");
    assert.equal((await book(p, await on(3, event, 2500), "free")).error?.message, "not_free");
    assert.ifError((await book(p, await on(4, event, 0), "free")).error);
  });

  test("a client uses a discount code once; an expired request frees it again", async () => {
    const p = await client("r4-code");
    const { data: code } = await db.from("discount_codes").insert({ code: `T${Date.now().toString(36).toUpperCase()}`, kind: "percent", value: 10 }).select("id").single();
    const pay = (status: "pending" | "paid") => db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 6300, purpose: "pack", description: "Test package", status, discount_code_id: code!.id }).select("id").single();
    const first = await pay("pending");
    assert.ifError(first.error);
    assert.match((await pay("pending")).error?.message ?? "", /payments_one_code_per_client/);
    assert.ifError((await db.from("payments").update({ status: "cancelled" }).eq("id", first.data!.id)).error); // expired / removed
    assert.ifError((await pay("pending")).error);
  });

  test("stats: twelve months for any year", async () => {
    const { data, error } = await db.rpc("stats_months", { p_year: Number(todayKey().slice(0, 4)) });
    assert.ifError(error);
    assert.equal(data!.length, 12);
    assert.ok(data!.every((m) => m.booked <= m.spots));
  });
});

describe("her notes, round 5", () => {
  test("a class type with its own packages: trial, package and booking all work", async () => {
    const label = `Pre natal ${Date.now().toString(36)}`;
    const { data: key, error } = await db.rpc("add_credit_kind", { p_label: label });
    assert.ifError(error);
    assert.match(key as string, /^pre_natal_/);
    assert.equal((await db.from("credit_kinds").select("label").eq("key", key as string).single()).data?.label, label);
    const { data: type, error: e2 } = await db.from("class_types").insert({
      slug: `t-${Date.now()}`, name: label, kind: "other" as never, credit_kind: key as string, default_capacity: 3, default_duration_minutes: 50, price_cents: 0,
    }).select("id").single();
    assert.ifError(e2);
    await db.from("products").insert({ name: `${label} Trial`, kind: "single", tag: "trial", credit_kind: key as string, credits: 1, price_cents: 2000 });
    const start = iso(48 * H);
    const sid = (await db.from("class_sessions").insert({ class_type_id: type!.id, starts_at: start, ends_at: iso(48 * H + 50 * 60_000), capacity: 3 }).select("id").single()).data!.id;
    // Trial: only for someone who hasn't booked this type before.
    const p = await client("r5-kind");
    assert.equal((await db.rpc("trial_eligible", { p_profile: p, p_kind: key as string })).data, true);
    assert.ifError((await book(p, sid, "trial", "online", "cash")).error);
    // A package of this type pays for its classes; a Reformer package doesn't.
    const q = await client("r5-kind-pack");
    await grant(q, 4, null);
    assert.equal((await book(q, sid)).error?.message, "no_credits");
    assert.ifError((await db.rpc("grant_lot", { p_profile: q, p_kind: key as string, p_credits: 2, p_expires: null as unknown as string, p_note: "test" })).error);
    assert.ifError((await book(q, sid)).error);
  });

  test("codes say what they apply to (at least one)", async () => {
    const mk = (applies: string[]) => db.from("discount_codes").insert({ code: `R5${Math.random().toString(36).slice(2, 8).toUpperCase()}`, kind: "percent", value: 10, applies_to: applies });
    assert.ifError((await mk(["trial", "event"])).error);
    assert.ok((await mk([])).error);
    assert.ok((await mk(["nonsense"])).error);
  });

  test("the Terms can be saved as her own text", async () => {
    assert.ifError((await db.from("site_content").upsert({ key: "terms", value: "## Test\nHello" })).error);
    await db.from("site_content").delete().eq("key", "terms");
  });
});

describe("account linking (A-002, A-008)", () => {
  const anon = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const stamp = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  /** A client the studio added (imported, DM, manual): a profile with no login. */
  async function imported(email: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await db.from("profiles").insert({ full_name: "Imported Client", email, ...extra }).select("id").single();
    assert.ifError(error);
    return data!.id;
  }
  const profile = async (id: string) => (await db.from("profiles").select("user_id, role, email").eq("id", id).single()).data!;
  /** Prove the email the way the app does: a code from the email, checked by Supabase Auth. */
  async function confirmWithCode(email: string) {
    const link = await db.auth.admin.generateLink({ type: "magiclink", email });
    assert.ifError(link.error);
    const v = await anon.auth.verifyOtp({ email, token: link.data.properties!.email_otp, type: "email" });
    assert.ifError(v.error);
    return v.data.user!.id;
  }

  test("an unconfirmed login with the same email doesn't get the profile; confirming with a code links it", async () => {
    const email = `link-${stamp()}@example.com`;
    const p = await imported(email);
    await grant(p, 5, null);
    const { data, error } = await db.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: false });
    assert.ifError(error);
    assert.equal((await profile(p)).user_id, null);
    assert.equal((await db.from("profiles").select("id").eq("user_id", data.user!.id)).data!.length, 0, "no profile before the email is proven");
    assert.equal(await confirmWithCode(email), data.user!.id);
    assert.equal((await profile(p)).user_id, data.user!.id);
  });

  test("a login created already confirmed (autoconfirm / admin API) never takes over an existing profile", async () => {
    const email = `autoconf-${stamp()}@example.com`;
    const p = await imported(email);
    const { data, error } = await db.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: true });
    assert.ifError(error);
    assert.equal((await profile(p)).user_id, null);
    assert.equal((await db.from("profiles").select("id").eq("user_id", data.user!.id)).data!.length, 0);
    // A brand-new email still gets its own profile.
    const fresh = `fresh-${stamp()}@example.com`;
    const created = await db.auth.admin.createUser({ email: fresh, email_confirm: true });
    assert.equal((await db.from("profiles").select("email").eq("user_id", created.data.user!.id).single()).data?.email, fresh);
  });

  test("Studio-team invites aren't admin profiles, and a login for that email doesn't become admin", async () => {
    const email = `invite-${stamp()}@example.com`;
    assert.ifError((await db.from("team_invites").insert({ email })).error);
    const { data } = await db.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: true });
    const mine = (await db.from("profiles").select("role").eq("user_id", data.user!.id).single()).data;
    assert.equal(mine?.role, "client");
    assert.equal((await db.from("profiles").select("id").eq("email", email).eq("role", "admin")).data!.length, 0);
    // Also not through a code-confirmed sign-up on the database side: only the app grants the invite.
    const other = `invite2-${stamp()}@example.com`;
    await db.from("team_invites").insert({ email: other });
    await db.auth.admin.createUser({ email: other, password: "pw-12345678", email_confirm: false });
    const uid = await confirmWithCode(other);
    assert.equal((await db.from("profiles").select("role").eq("user_id", uid).single()).data?.role, "client");
  });

  test("_ and % in an email don't match anyone else; emails are stored lower-case", async () => {
    const t = stamp();
    const victim = await imported(`x.y${t}@example.com`);
    const pct = await imported(`xay${t}@example.com`);
    await db.auth.admin.createUser({ email: `x_y${t}@example.com`, password: "pw-12345678", email_confirm: false });
    const uid = await confirmWithCode(`x_y${t}@example.com`);
    await db.auth.admin.createUser({ email: `x%y${t}@example.com`, password: "pw-12345678", email_confirm: false });
    const uid2 = await confirmWithCode(`x%y${t}@example.com`);
    assert.equal((await profile(victim)).user_id, null);
    assert.equal((await profile(pct)).user_id, null);
    assert.equal((await db.from("profiles").select("email").eq("user_id", uid).single()).data?.email, `x_y${t}@example.com`);
    assert.equal((await db.from("profiles").select("email").eq("user_id", uid2).single()).data?.email, `x%y${t}@example.com`);
    const mixed = await imported(`MiXeD${t}@Example.com`);
    assert.equal((await profile(mixed)).email, `mixed${t}@example.com`);
  });
});

describe("health data (A-001, A-105)", () => {
  const V = "health-2026-11-v1";
  const answers = { conditions: ["back"], details: "Lower back ache", pregnancy: null, pregnancy_weeks: null, postpartum_months: null, bp_meds: false, medication: null, clearance_needed: false };
  const save = (p: string, mode: string, a: object | null, consent: boolean) =>
    db.rpc("save_health_answers", { p_profile: p, p_mode: mode, p_answers: a as never, p_consent: consent, p_version: V });
  const state = async (p: string) => ({
    profile: (await db.from("profiles").select("parq_completed_at, health_mode").eq("id", p).single()).data!,
    notes: (await db.from("health_notes").select("profile_id").eq("profile_id", p)).data!.length,
    history: (await db.from("health_history").select("id").eq("profile_id", p)).data!.length,
    consents: (await db.from("consents").select("type, granted, version").eq("profile_id", p).order("id")).data!,
  });

  test("answers need consent, are saved in one go, and a standing consent isn't re-recorded", async () => {
    const p = await client("health-save");
    assert.equal((await save(p, "answers", answers, false)).error?.message, "health_consent_required");
    // A bad row rolls everything back: nothing stored and not marked answered.
    assert.ok((await save(p, "answers", { ...answers, pregnancy_weeks: "lots" }, true)).error);
    let s = await state(p);
    assert.equal(s.profile.parq_completed_at, null);
    assert.equal(s.notes + s.history + s.consents.length, 0);
    assert.ifError((await save(p, "answers", answers, true)).error);
    s = await state(p);
    assert.ok(s.profile.parq_completed_at);
    assert.equal(s.profile.health_mode, "answers");
    assert.deepEqual([s.notes, s.history], [1, 1]);
    assert.deepEqual(s.consents, [{ type: "health_data", granted: true, version: V }]);
    assert.ifError((await save(p, "answers", { ...answers, details: "Better now" }, false)).error);
    s = await state(p);
    assert.equal(s.history, 2);
    assert.equal(s.consents.length, 1, "consent already on file: no new row");
  });

  test("withdrawing deletes the notes and all history and records granted=false; booking stays possible", async () => {
    const p = await client("health-withdraw");
    await save(p, "answers", answers, true);
    await save(p, "answers", answers, true);
    const { data, error } = await db.rpc("withdraw_health_consent", { p_profile: p, p_version: V });
    assert.ifError(error);
    assert.equal(data, true);
    const s = await state(p);
    assert.deepEqual([s.notes, s.history], [0, 0]);
    assert.deepEqual(s.consents.at(-1), { type: "health_data", granted: false, version: V });
    assert.ok(s.profile.parq_completed_at);
    assert.equal(s.profile.health_mode, "in_person");
    // Withdrawing again changes nothing and records nothing.
    assert.equal((await db.rpc("withdraw_health_consent", { p_profile: p, p_version: V })).data, false);
    assert.equal((await state(p)).consents.length, s.consents.length);
  });

  test("\"No conditions\" after earlier answers deletes the history and withdraws the consent", async () => {
    const p = await client("health-none");
    await save(p, "answers", answers, true);
    assert.ifError((await save(p, "none", null, false)).error);
    const s = await state(p);
    assert.deepEqual([s.notes, s.history], [0, 0]);
    assert.equal(s.profile.health_mode, "none");
    assert.deepEqual(s.consents.at(-1), { type: "health_data", granted: false, version: V });
  });

  test("telling the instructor in person stores nothing and still counts as answered", async () => {
    const p = await client("health-inperson");
    assert.ifError((await save(p, "in_person", null, false)).error);
    const s = await state(p);
    assert.ok(s.profile.parq_completed_at);
    assert.equal(s.profile.health_mode, "in_person");
    assert.deepEqual([s.notes, s.history], [0, 0]);
    assert.deepEqual(s.consents, [{ type: "health_declaration_offline", granted: true, version: V }]);
  });

  test("RLS: only a studio member with can_view_health reads health notes", async () => {
    const anon = () => createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const p = await client("health-rls");
    await save(p, "answers", answers, true);
    const email = `team-${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { data: u } = await db.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: true });
    assert.ifError((await db.from("profiles").update({ role: "admin" }).eq("user_id", u.user!.id)).error);
    const c = anon();
    assert.ifError((await c.auth.signInWithPassword({ email, password: "pw-12345678" })).error);
    assert.equal((await c.from("health_notes").select("profile_id").eq("profile_id", p)).data!.length, 0, "an admin without can_view_health sees nothing");
    await db.from("profiles").update({ can_view_health: true }).eq("user_id", u.user!.id);
    assert.equal((await c.from("health_notes").select("profile_id").eq("profile_id", p)).data!.length, 1);
    assert.equal((await c.from("health_history").select("id").eq("profile_id", p)).data?.length ?? 0, 0, "history is server-only");
  });
});

// ---------------------------------------------------------------------------
// WP3: booking engine and payments (A-004 … A-083). Races fire from separate connections.
// ---------------------------------------------------------------------------
describe("WP3: engine hardening", () => {
  const D = 86_400_000;
  const pg = postgres(env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  after(() => pg.end());
  const bid = (r: { data: unknown }) => (r.data as { booking_id: string }).booking_id;
  const status = (r: { error: { message: string } | null }) => r.error?.message ?? "ok";
  /** Every lot: the cached remaining equals the sum of its ledger entries. */
  async function assertLedgerInvariant() {
    const bad = await pg`select l.id from credit_lots l left join credit_ledger g on g.lot_id = l.id
      group by l.id, l.remaining having l.remaining <> coalesce(sum(g.delta), 0)`;
    assert.equal(bad.length, 0, `${bad.length} lots out of step with the ledger`);
  }
  /** n calls fired together, each on its own database connection. */
  async function parallel<T>(n: number, fn: (c: postgres.Sql, i: number) => Promise<T>) {
    const cs = Array.from({ length: n }, () => postgres(env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} }));
    await Promise.all(cs.map((c) => c`select 1`));
    try { return await Promise.all(cs.map((c, i) => fn(c, i))); } finally { await Promise.all(cs.map((c) => c.end())); }
  }
  const pgBook = (c: postgres.Sql, p: string, s: string, mode: string, method: string | null = null) =>
    c`select book_session(${p}, ${s}, ${mode}, 'online', ${method}) as r`.then(() => "ok", (e: Error) => e.message);
  const phone = () => `+357 99 ${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const withPhone = async (tag: string, ph: string) => { const p = await client(tag); await db.from("profiles").update({ phone: ph }).eq("id", p); return p; };
  const payOf = async (booking: string) => (await db.from("payments").select("id, status").eq("booking_id", booking).single()).data!;
  const confirm = (pay: string) => db.rpc("confirm_payment", { p_payment: pay, p_provider_ref: undefined as unknown as string, p_method: "cash" });
  const cancel = (b: string, p: string, admin = false) => db.rpc("cancel_booking", { p_booking: b, p_profile: p, p_admin: admin });

  test("A-004: parallel trials, parallel drop-ins and two accounts with one phone each get exactly one", async () => {
    const p = await withPhone("wp3-trial", phone());
    const [s1, s2] = [await session(2 * D + 1000), await session(3 * D + 1000)];
    const trials = await parallel(2, (c, i) => pgBook(c, p, i ? s2 : s1, "trial", "cash"));
    assert.equal(trials.filter((r) => r === "ok").length, 1, JSON.stringify(trials));

    const q = await client("wp3-dropin");
    const [s3, s4] = [await session(2 * D + 2000), await session(3 * D + 2000)];
    const drops = await parallel(2, (c, i) => pgBook(c, q, i ? s4 : s3, "drop_in", "cash"));
    assert.deepEqual(drops.sort(), ["ok", "unpaid_limit"]);

    const ph = phone();
    const a = await withPhone("wp3-ph-a", ph), b = await withPhone("wp3-ph-b", ph.replace(/\s/g, ""));
    const [s5, s6] = [await session(2 * D + 3000), await session(3 * D + 3000)];
    const two = await parallel(2, (c, i) => pgBook(c, i ? b : a, i ? s6 : s5, "trial", "cash"));
    assert.deepEqual(two.sort(), ["ok", "trial_used"]);
  });

  test("concurrent last spot: two parallel bookings for one remaining spot, exactly one gets it", async () => {
    const s = await session(2 * D + 4000, 3);
    for (const t of ["ls1", "ls2"]) { const p = await client(t); await grant(p, 1, 30 * D); assert.ifError((await book(p, s)).error); }
    const [x, y] = [await client("ls-x"), await client("ls-y")];
    await grant(x, 1, 30 * D); await grant(y, 1, 30 * D);
    const res = await parallel(2, (c, i) => pgBook(c, i ? y : x, s, "credit"));
    assert.deepEqual(res.sort(), ["full", "ok"]);
    assert.equal((await db.from("bookings").select("id", { count: "exact", head: true }).eq("session_id", s).eq("status", "confirmed")).count, 3);
    await assertLedgerInvariant();
  });

  test("double tap: same client, same class, twice at once: one booking, one class used", async () => {
    const p = await client("wp3-dbl");
    const lot = await grant(p, 2, 30 * D);
    const s = await session(2 * D + 5000);
    const res = await parallel(2, (c) => pgBook(c, p, s, "credit"));
    assert.deepEqual(res.sort(), ["already_booked", "ok"]);
    assert.equal(await lotRemaining(lot), 1);
    await assertLedgerInvariant();
  });

  test("cancellation exactly at the 6h cutoff: 1 ms inside is late, exactly 6h is in time", async () => {
    const RB = new Error("rollback");
    const at = async (offset: string) => {
      let out: { r: string; rem: number } | undefined;
      await pg.begin(async (t) => {
        const p = (await t`insert into profiles (full_name, email, onboarded_at) values ('Cutoff', ${`cut-${Date.now()}-${Math.random()}@example.com`}, now()) returning id`)[0].id;
        await t`select grant_lot(${p}, 'reformer', 1, now() + interval '30 days', 'cutoff')`;
        const s = (await t`insert into class_sessions (class_type_id, starts_at, ends_at, capacity, title)
          values (${reformer}, now() + ${offset}::interval, now() + ${offset}::interval + interval '50 min', 3, 'Cutoff') returning id`)[0].id;
        const b = (await t`select book_session(${p}, ${s}, 'credit') as r`)[0].r.booking_id;
        const r = (await t`select cancel_booking(${b}, ${p}, false) as r`)[0].r.status;
        out = { r, rem: (await t`select sum(remaining)::int n from credit_lots where profile_id = ${p}`)[0].n };
        throw RB;
      }).catch((e) => { if (e !== RB) throw e; });
      return out!;
    };
    assert.deepEqual(await at("5 hours 59 minutes 59.999 seconds"), { r: "late_cancelled", rem: 0 });
    assert.deepEqual(await at("6 hours"), { r: "cancelled", rem: 1 });
  });

  test("A-005: a cancel books the first in line in the same call; nobody can take the spot in between", async () => {
    const s = await session(3 * D + 6000, 1);
    const a = await client("wp3-wl-a"); await grant(a, 1, 30 * D);
    const ab = bid(await book(a, s));
    const w = await client("wp3-wl-w"); await grant(w, 1, 30 * D);
    assert.ifError((await db.rpc("join_waitlist", { p_profile: w, p_session: s })).error);
    const { data, error } = await cancel(ab, a);
    assert.ifError(error);
    const offers = (data as { offers: { profile_id: string; offer_expires_at: string | null }[] }).offers;
    assert.deepEqual(offers.map((o) => [o.profile_id, o.offer_expires_at]), [[w, null]]);
    assert.equal((await db.from("waitlist_entries").select("status").eq("session_id", s).eq("profile_id", w).single()).data?.status, "claimed");
    const d = await client("wp3-wl-d"); await grant(d, 1, 30 * D);
    assert.equal(status(await book(d, s)), "full");
    await assertLedgerInvariant();
  });

  test("A-005: a free spot with people waiting is refused online (waitlist_first); the first in line and the studio can book", async () => {
    const s = await session(3 * D + 7000, 1);
    const a = await client("wp3-wf-a"); await grant(a, 1, 30 * D);
    assert.ifError((await book(a, s)).error);
    const w1 = await client("wp3-wf-w1"), w2 = await client("wp3-wf-w2");
    await grant(w1, 1, 30 * D); await grant(w2, 1, 30 * D);
    assert.ifError((await db.rpc("join_waitlist", { p_profile: w1, p_session: s })).error);
    assert.ifError((await db.rpc("join_waitlist", { p_profile: w2, p_session: s })).error);
    await db.from("class_sessions").update({ capacity: 2 }).eq("id", s); // a spot opens without the waitlist moving
    const d = await client("wp3-wf-d"); await grant(d, 1, 30 * D);
    assert.equal(status(await book(d, s)), "waitlist_first");
    assert.ifError((await db.rpc("join_waitlist", { p_profile: d, p_session: s })).error); // they can queue behind them
    assert.equal(status(await book(w2, s)), "waitlist_first", "second in line waits for the first");
    assert.ifError((await book(w1, s)).error);
    await db.from("class_sessions").update({ capacity: 3 }).eq("id", s);
    assert.ifError((await bookFar(d, s)).error); // the studio can add anyone
  });

  test("A-082: joining the waitlist beyond the booking window is refused", async () => {
    const s = await session(60 * D + 8000, 1);
    const q = await client("wp3-far-q"); assert.ifError((await book(q, s, "manual", "manual")).error);
    const p = await client("wp3-far-p");
    assert.equal(status(await db.rpc("join_waitlist", { p_profile: p, p_session: s })), "beyond_window");
  });

  test("A-081: refund-if-filled returns the late canceller's class only when the class was otherwise full", async () => {
    await db.from("studio_settings").update({ refund_late_cancel_if_filled: true }).eq("id", 1);
    try {
      // Class with free spots anyway: a newcomer doesn't refund the late canceller.
      const s = await session(3 * H + 1000, 3);
      const x = await client("wp3-lf-x"); const lx = await grant(x, 1, 30 * D);
      await cancel(bid(await book(x, s)), x);
      assert.ifError((await book(await client("wp3-lf-n"), s, "manual", "manual")).error);
      assert.equal(await lotRemaining(lx), 0);
      // Full class: the newcomer took the late canceller's spot.
      const f = await session(3 * H + 2000, 2);
      const y = await client("wp3-lf-y"); const ly = await grant(y, 1, 30 * D);
      const yb = bid(await book(y, f));
      assert.ifError((await book(await client("wp3-lf-o"), f, "manual", "manual")).error);
      await cancel(yb, y);
      assert.ifError((await book(await client("wp3-lf-m"), f, "manual", "manual")).error);
      assert.equal(await lotRemaining(ly), 1);
      await assertLedgerInvariant();
    } finally {
      await db.from("studio_settings").update({ refund_late_cancel_if_filled: false }).eq("id", 1);
    }
  });

  test("A-006: Mark as paid on a late-cancelled or no-show unpaid class records the fee and never re-books", async () => {
    const p = await client("wp3-fee");
    const s = await session(3 * H + 3000, 1);
    const b = bid(await book(p, s, "drop_in", "online", "cash"));
    await cancel(b, p);
    assert.ifError((await book(await client("wp3-fee-o"), s, "manual", "manual")).error); // the class is full again
    const pay = await payOf(b);
    assert.equal(pay.status, "pending");
    const { data, error } = await confirm(pay.id);
    assert.ifError(error);
    assert.equal((data as { status: string }).status, "fee_paid");
    assert.equal((await payOf(b)).status, "paid");
    assert.equal((await db.from("bookings").select("status").eq("id", b).single()).data?.status, "late_cancelled");
    assert.equal((await db.from("bookings").select("id", { count: "exact", head: true }).eq("session_id", s).eq("status", "confirmed")).count, 1);

    const q = await client("wp3-fee-ns");
    const past = bid(await book(q, await session(-2 * H + 3000), "pay_at_studio", "manual"));
    assert.ifError((await db.from("bookings").update({ status: "no_show" }).eq("id", past)).error);
    assert.equal(((await confirm((await payOf(past)).id)).data as { status: string }).status, "fee_paid");
    assert.equal((await db.from("bookings").select("status").eq("id", past).single()).data?.status, "no_show");
  });

  test("A-007: a trial product can't be paid as a package", async () => {
    const p = await client("wp3-pack");
    const prod = (await db.from("products").select("id, price_cents").eq("tag", "trial").eq("active", true).limit(1).single()).data!;
    const { data: pay } = await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: prod.price_cents, purpose: "pack", product_id: prod.id, description: "Trial", status: "pending" }).select("id").single();
    assert.equal(status(await confirm(pay!.id)), "not_a_package");
    assert.equal((await db.from("credit_lots").select("id").eq("profile_id", p)).data!.length, 0);
  });

  test("A-038: reward classes are added inside Mark as paid, exactly once", async () => {
    const p = await client("wp3-reward");
    const { data: code } = await db.from("discount_codes").insert({ code: `RW-WP3${Date.now().toString(36).toUpperCase()}`, kind: "free_classes", value: 2, profile_id: p }).select("id").single();
    const prod = (await db.from("products").select("id, credits").eq("tag", "package").eq("credit_kind", "reformer").eq("active", true).limit(1).single()).data!;
    const { data: pay } = await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7000, purpose: "pack", product_id: prod.id, description: "Pack", status: "pending", discount_code_id: code!.id }).select("id").single();
    const first = await confirm(pay!.id);
    assert.deepEqual([(first.data as { status: string }).status, (first.data as { extra: number }).extra], ["credits_added", 2]);
    assert.equal(((await confirm(pay!.id)).data as { status: string }).status, "already_paid");
    const { data: lots } = await db.from("credit_lots").select("total, remaining").eq("payment_id", pay!.id);
    assert.deepEqual(lots, [{ total: prod.credits + 2, remaining: prod.credits + 2 }]);
    await assertLedgerInvariant();
  });

  test("studio cancels a class: a 2-class booking gets both classes back on the same package (studio_cancel)", async () => {
    const { data: t } = await db.from("class_types").insert({ slug: `wp3-double-${Date.now()}`, name: "WP3 double", kind: "reformer", credit_kind: "reformer", credit_cost: 2, default_capacity: 3, default_duration_minutes: 50, price_cents: 0, active: false }).select("id").single();
    const start = iso(4 * D + 11_000);
    const { data: s } = await db.from("class_sessions").insert({ class_type_id: t!.id, starts_at: start, ends_at: iso(4 * D + 11_000 + 50 * 60_000), capacity: 3, title: "WP3 double" }).select("id").single();
    const p = await client("wp3-sc");
    const lot = await grant(p, 3, 30 * D);
    const b = bid(await book(p, s!.id));
    assert.equal(await lotRemaining(lot), 1);
    const { data: rows, error } = await db.rpc("cancel_sessions", { p_sessions: [s!.id], p_reason: "test" });
    assert.ifError(error);
    assert.deepEqual(rows?.map((r) => r.booking_id), [b]);
    assert.equal(await lotRemaining(lot), 3);
    const { data: led } = await db.from("credit_ledger").select("delta, note, lot_id").eq("booking_id", b).eq("entry_type", "cancel_refund");
    assert.deepEqual(led, [{ delta: 2, note: "studio_cancel", lot_id: lot }]);
    await assertLedgerInvariant();
  });

  test("A-038: confirming a closure cancels its classes, credits clients and blocks bookings in one call", async () => {
    const day = addDaysKey(todayKey(), 20);
    const start = localToUtc(day, "07:13");
    const { data: s } = await db.from("class_sessions").insert({ class_type_id: reformer, starts_at: start, ends_at: new Date(Date.parse(start) + 50 * 60_000).toISOString(), capacity: 3, title: "Closure" }).select("id").single();
    const p = await client("wp3-closure");
    const lot = await grant(p, 1, 90 * D);
    assert.ifError((await bookFar(p, s!.id)).error);
    const { data: c } = await db.from("closures").insert({ name: "WP3 closure", starts_on: day, ends_on: day }).select("id").single();
    const { data, error } = await db.rpc("confirm_closure", { p_closure: c!.id });
    assert.ifError(error);
    const res = data as { classes: number; people: { profile_id: string }[] };
    assert.ok(res.classes >= 1);
    assert.ok(res.people.some((x) => x.profile_id === p));
    assert.equal(await lotRemaining(lot), 1);
    const later = await db.from("class_sessions").insert({ class_type_id: reformer, starts_at: localToUtc(day, "18:17"), ends_at: localToUtc(day, "19:07"), capacity: 3, title: "Closure 2" }).select("id").single();
    try {
      assert.ifError(later.error);
      assert.equal(status(await book(p, later.data!.id)), "studio_closed");
    } finally {
      await db.from("closures").delete().eq("id", c!.id);
    }
  });

  test("A-064: events can't be cancelled by clients in the engine; the studio can remove someone", async () => {
    const event = (await db.from("class_types").select("id").eq("kind", "event").limit(1).single()).data!.id;
    const { data: s } = await db.from("class_sessions").insert({ class_type_id: event, starts_at: iso(9 * D + 13_000), ends_at: iso(9 * D + 13_000 + 90 * 60_000), capacity: 5, title: "WP3 event", price_cents: 0 }).select("id").single();
    const p = await client("wp3-ev");
    const b = bid(await book(p, s!.id, "free"));
    assert.equal(status(await cancel(b, p)), "event_no_cancel");
    assert.equal(((await cancel(b, p, true)).data as { status: string }).status, "cancelled");
  });
});
