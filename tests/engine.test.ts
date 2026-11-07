// Booking-engine tests against the local Supabase (npx supabase start && npx supabase db reset).
// Run: npm run test:engine
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/supabase/types";
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
    // Two different packages: one client has at most one pending request per package (A-034).
    const [product, other] = (await db.from("products").select("id").eq("kind", "pack").limit(2)).data!.map((r) => r.id);
    const old = (await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "pack", product_id: product, description: "old", status: "pending", created_at: iso(-49 * H) }).select("id").single()).data!.id;
    const fresh = (await db.from("payments").insert({ profile_id: p, provider: "offline", amount_cents: 7500, purpose: "pack", product_id: other, description: "fresh", status: "pending", created_at: iso(-2 * H) }).select("id").single()).data!.id;
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

  test("A-034: two package requests at once leave one pending row", async () => {
    const p = await client("wp3-req");
    const prod = (await db.from("products").select("id").eq("tag", "package").eq("active", true).limit(1).single()).data!.id;
    const res = await parallel(2, (c) => c`insert into payments (profile_id, provider, amount_cents, purpose, product_id, description, status)
      values (${p}, 'offline', 7000, 'pack', ${prod}, 'WP3', 'pending')`.then(() => "ok", (e: Error) => e.message));
    assert.equal(res.filter((r) => r === "ok").length, 1);
    assert.match(res.find((r) => r !== "ok") ?? "", /payments_one_pending_request/);
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

  test("A-083: a no-show can only be marked once the class has started", async () => {
    const p = await client("wp3-ns");
    const future = bid(await book(p, await session(2 * D + 9000), "manual", "manual"));
    assert.match((await db.from("bookings").update({ status: "no_show" }).eq("id", future)).error?.message ?? "", /class_not_started/);
    const past = bid(await book(p, await session(-2 * H), "manual", "manual"));
    assert.ifError((await db.from("bookings").update({ status: "no_show" }).eq("id", past)).error);
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

  test("A-037: a code limited to one use can't be used twice at once", async () => {
    const { data: code } = await db.from("discount_codes").insert({ code: `WP3${Date.now().toString(36).toUpperCase()}`, kind: "percent", value: 10, max_uses: 1 }).select("id").single();
    const [a, b] = [await client("wp3-code-a"), await client("wp3-code-b")];
    const res = await parallel(2, (c, i) => c`insert into payments (profile_id, provider, amount_cents, purpose, description, status, discount_code_id)
      values (${i ? b : a}, 'offline', 6300, 'pack', 'WP3 code', 'pending', ${code!.id})`.then(() => "ok", (e: Error) => e.message));
    assert.deepEqual(res.sort(), ["code_used_up", "ok"]);
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

  test("A-039: editing a booked class checks capacity, type and the client's package", async () => {
    const s = await session(5 * D + 12_000, 3);
    const p = await client("wp3-edit"), q = await client("wp3-edit-q");
    await grant(q, 1, 30 * D);
    const lot = await db.rpc("grant_lot", { p_profile: p, p_kind: "reformer", p_credits: 4, p_expires: null as unknown as string, p_note: "pack", p_validity_days: 30 });
    assert.ifError((await book(p, s)).error); assert.ifError((await book(q, s)).error);
    const upd = (patch: Record<string, unknown>) => db.rpc("update_session", { p_session: s, p_patch: patch as unknown as Json });
    assert.equal(status(await upd({ capacity: 1 })), "capacity_below_booked");
    const mat = (await db.from("class_types").select("id").eq("slug", "mat").single()).data!.id;
    assert.equal(status(await upd({ class_type_id: mat })), "type_locked");
    const before = (await db.from("credit_lots").select("expires_at").eq("id", lot.data as string).single()).data!.expires_at!;
    const moved = iso(6 * D + 12_000);
    const r = await upd({ starts_at: moved, ends_at: iso(6 * D + 12_000 + 50 * 60_000), capacity: 2 });
    assert.ifError(r.error);
    assert.deepEqual([(r.data as { booked: number }).booked, (r.data as { moved: boolean }).moved], [2, true]);
    const later = (await db.from("credit_lots").select("expires_at").eq("id", lot.data as string).single()).data!.expires_at!;
    assert.ok(Date.parse(later) > Date.parse(before), "the provisional expiry follows the moved first class");
  });

  test("A-064: events can't be cancelled by clients in the engine; the studio can remove someone", async () => {
    const event = (await db.from("class_types").select("id").eq("kind", "event").limit(1).single()).data!.id;
    const { data: s } = await db.from("class_sessions").insert({ class_type_id: event, starts_at: iso(9 * D + 13_000), ends_at: iso(9 * D + 13_000 + 90 * 60_000), capacity: 5, title: "WP3 event", price_cents: 0 }).select("id").single();
    const p = await client("wp3-ev");
    const b = bid(await book(p, s!.id, "free"));
    assert.equal(status(await cancel(b, p)), "event_no_cancel");
    assert.equal(((await cancel(b, p, true)).data as { status: string }).status, "cancelled");
  });

  test("A-035: the booking window can be 26 weeks; private sessions are never booked online", async () => {
    const was = (await db.from("studio_settings").select("booking_window_days").single()).data!.booking_window_days;
    assert.ifError((await db.from("studio_settings").update({ booking_window_days: 182 }).eq("id", 1)).error);
    await db.from("studio_settings").update({ booking_window_days: was }).eq("id", 1);
    const priv = (await db.from("class_types").select("id").eq("slug", "private-reformer").single()).data!.id;
    const { data: s } = await db.from("class_sessions").insert({ class_type_id: priv, starts_at: iso(3 * D + 14_000), ends_at: iso(3 * D + 14_000 + 50 * 60_000), capacity: 1, title: "WP3 private" }).select("id").single();
    const p = await client("wp3-priv");
    await db.rpc("grant_lot", { p_profile: p, p_kind: "private_reformer", p_credits: 1, p_expires: null as unknown as string, p_note: "t" });
    assert.match(status(await book(p, s!.id)), /private_class/);
    assert.ifError((await book(p, s!.id, "credit", "manual")).error);
  });
});

describe("WP5: tick queries", () => {
  // Cyprus clocks go forward on Sunday 28 March 2027 (03:00 → 04:00). A class at 08:00 local the day after
  // is 05:00 UTC; its reminders are due 24h and 2h before in real elapsed time.
  test("DST: due_reminders(1440) and (120) select a booking at 08:00 the day after spring-forward exactly once, then not again (A-049)", async () => {
    const start = localToUtc("2027-03-29", "08:00");
    assert.equal(start, "2027-03-29T05:00:00.000Z");
    const startMs = new Date(start).getTime();
    const { data: s } = await db.from("class_sessions").insert({ class_type_id: reformer, starts_at: start, ends_at: new Date(startMs + 50 * 60_000).toISOString(), capacity: 3, title: "DST reminder test" }).select("id").single();
    const p = await client("dst-reminder");
    const off = await client("dst-reminder-off");
    await db.from("profiles").update({ reminder_emails: false }).eq("id", off);
    for (const who of [p, off]) { await grant(who, 1, null); assert.ifError((await bookFar(who, s!.id)).error); }
    const bookingId = (await db.from("bookings").select("id").eq("session_id", s!.id).eq("profile_id", p).single()).data!.id;
    const due = async (offset: number, minutesBefore: number) =>
      ((await db.rpc("due_reminders", { p_offset: offset, p_now: new Date(startMs - minutesBefore * 60_000).toISOString() })).data ?? [])
        .filter((r) => r.session_id === s!.id).map((r) => r.booking_id);

    assert.deepEqual(await due(1440, 1441), [], "not before 24h");
    assert.deepEqual(await due(1440, 1439), [bookingId], "24h reminder, once, and not for someone who turned reminders off");
    assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(startMs - 1440 * 60_000)), "08:00", "24h earlier is 08:00 local too (after the jump)");
    assert.deepEqual(await due(1440, 119), [], "inside 2h it's the 2h reminder's turn");
    assert.deepEqual(await due(120, 119), [bookingId], "2h reminder, once");

    await db.from("notifications").insert({ channel: "email", template: "reminder_24h", recipient: "x@example.com", body: "x", status: "logged", dedupe_key: `reminder:1440:${bookingId}:email`, booking_id: bookingId });
    assert.deepEqual(await due(1440, 1439), [], "not again once the reminder is in the Outbox");
    assert.deepEqual(await due(120, 119), [bookingId], "the 2h reminder is separate");
    await db.from("class_sessions").update({ status: "cancelled" }).eq("id", s!.id);
  });

  test("low_credit_groups: exactly one usable class left of a kind, once per set of packages (A-049)", async () => {
    const p = await client("low");
    const lot = await grant(p, 1, 30 * 24 * H);
    const mine = async () => ((await db.rpc("low_credit_groups")).data ?? []).filter((g) => g.profile_id === p);
    assert.deepEqual(await mine(), [{ profile_id: p, credit_kind: "reformer", lot_ids: lot }]);
    await db.from("notifications").insert({ channel: "email", template: "credits_low", recipient: "x@example.com", body: "x", status: "logged", dedupe_key: `low:${lot}:email` });
    assert.deepEqual(await mine(), [], "told once");
    await grant(p, 1, 30 * 24 * H);
    assert.deepEqual(await mine(), [], "two left: not low");
  });

  test("extend_timetable keeps classes at least booking window + 14 days ahead (QUAL-12)", async () => {
    const { data: cfg } = await db.from("studio_settings").select("booking_window_days, timezone").eq("id", 1).single();
    await db.from("studio_settings").update({ booking_window_days: 84 }).eq("id", 1);
    try {
      assert.ifError((await db.rpc("extend_timetable", {})).error);
      const { data: t } = await db.from("timetable_templates").select("valid_to").eq("repeats", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!t) return; // no repeating timetable on this database
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: cfg!.timezone }).format(new Date());
      assert.ok(t.valid_to >= addDaysKey(today, 84 + 14), `${t.valid_to} < today + 98 days`);
    } finally {
      await db.from("studio_settings").update({ booking_window_days: cfg!.booking_window_days }).eq("id", 1);
    }
  });
});

describe("WP6: atomic writes (A-019, A-054)", () => {
  test("save_timetable with an unknown class type changes nothing (old future classes stay)", async () => {
    const before = (await db.from("class_sessions").select("id", { count: "exact", head: true }).gt("starts_at", new Date().toISOString())).count;
    const templates = (await db.from("timetable_templates").select("id", { count: "exact", head: true })).count;
    const r = await db.rpc("save_timetable", { p_name: "bad", p_from: todayKey(), p_slots: [
      { weekday: 1, time: "07:00", class_type_id: reformer },
      { weekday: 2, time: "07:00", class_type_id: "00000000-0000-0000-0000-000000000000" },
    ] as unknown as Json });
    assert.equal(r.error?.message, "unknown_class_type");
    assert.equal((await db.from("class_sessions").select("id", { count: "exact", head: true }).gt("starts_at", new Date().toISOString())).count, before);
    assert.equal((await db.from("timetable_templates").select("id", { count: "exact", head: true })).count, templates);
  });

  test("onboard_profile saves details and consents together, or neither", async () => {
    const p = (await db.from("profiles").insert({ email: `t-onb-${Date.now()}@example.com` }).select("id").single()).data!.id;
    const docs = [];
    for (const doc of ["terms", "studio_rules", "payments_policy", "waiver"]) docs.push({ doc, id: ((await db.rpc("record_policy_version", { p_doc: doc, p_body: `${doc} (WP6 test)` })).data as { id: string }).id });
    const args = { p_profile: p, p_first: "Ana", p_last: "K", p_full: "Ana K", p_phone: "+357 99 111111", p_dob: "1990-02-02", p_email: "ANA@example.com", p_marketing: false, p_version: "v1", p_docs: docs as unknown as Json };
    // A photo choice the column refuses: the whole save rolls back (no onboarded_at, no consents).
    const bad = await db.rpc("onboard_profile", { ...args, p_photo: "sideways" });
    assert.ok(bad.error);
    assert.equal((await db.from("profiles").select("onboarded_at").eq("id", p).single()).data!.onboarded_at, null);
    assert.equal((await db.from("consents").select("id", { count: "exact", head: true }).eq("profile_id", p)).count, 0);
    assert.ifError((await db.rpc("onboard_profile", { ...args, p_photo: "no_face" })).error);
    const row = (await db.from("profiles").select("onboarded_at, email, full_name").eq("id", p).single()).data!;
    assert.ok(row.onboarded_at);
    assert.equal(row.email, "ana@example.com");
    // The four accepted documents (A-009, A-060: no fitness declaration), news and photos.
    assert.equal((await db.from("consents").select("id", { count: "exact", head: true }).eq("profile_id", p)).count, 6);
  });

  test("replace_recurring_rules keeps the old rules when a new one is bad", async () => {
    const p = await client("rr");
    assert.ifError((await db.rpc("replace_recurring_rules", { p_profile: p, p_slots: [{ class_type_id: reformer, weekday: 1, time: "18:00" }] as unknown as Json })).error);
    const bad = await db.rpc("replace_recurring_rules", { p_profile: p, p_slots: [
      { class_type_id: reformer, weekday: 2, time: "18:00" }, { class_type_id: reformer, weekday: 9, time: "18:00" },
    ] as unknown as Json });
    assert.ok(bad.error);
    const live = (await db.from("recurring_rules").select("weekday").eq("profile_id", p).eq("active", true)).data!;
    assert.deepEqual(live.map((r) => r.weekday), [1]);
  });
});

describe("WP7: privacy lifecycle (A-010, A-011)", () => {
  const pg = postgres(env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  after(() => pg.end());
  const count = async (q: Promise<{ count: string | number }[]>) => Number((await q)[0].count);

  test("account deletion leaves nothing identifiable, keeps anonymised records and moves the waitlist up", async () => {
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const email = `erase-${tag}@example.com`, phone = `+357 96 ${tag.slice(-6)}`, name = `Zoe Erasable${tag.slice(-4)}`;
    const { data: u } = await db.auth.admin.createUser({ email, password: "pw-erase-123", email_confirm: true });
    const fields = { user_id: u.user!.id, email, phone, full_name: name, first_name: "Zoe", onboarded_at: new Date().toISOString(),
      stripe_customer_id: "cus_test", student_verified_until: "2030-01-01", health_mode: "answers" };
    const existing = (await db.from("profiles").select("id").eq("user_id", u.user!.id).maybeSingle()).data;
    const p = existing
      ? (await db.from("profiles").update(fields).eq("id", existing.id).select("id").single()).data!.id
      : (await db.from("profiles").insert(fields).select("id").single()).data!.id;
    const other = await client("erase-waiter");
    // A full class they're booked into, with someone waiting who has a package class.
    const s = await session(72 * H, 1);
    const lot = await grant(p, 2, 60 * 24 * H, "injury: left knee");
    await grant(other, 2, 60 * 24 * H);
    assert.ifError((await book(p, s)).error);
    assert.ifError((await db.rpc("join_waitlist", { p_profile: other, p_session: s })).error);
    await pg`insert into public.lot_freezes (lot_id, starts_on, ends_on, reason) values (${lot}, current_date + 100, current_date + 101, 'back pain')`;
    await db.from("notifications").insert([
      { profile_id: p, channel: "email", template: "birthday", recipient: email, subject: "Happy birthday, Zoe!", body: "Hi Zoe", status: "sent", provider_ref: "re_1", error: `bounce ${email}` },
      { about_profile_id: p, channel: "email", template: "studio_alert", recipient: "studio@example.com", subject: `New client: ${name}`, body: `${email} · ${phone}`, status: "sent" },
      { channel: "email", template: "studio_alert", recipient: "studio@example.com", subject: `Details updated: ${name}`, body: `New mobile number: ${phone}`, status: "sent" },
      { channel: "email", template: "verify_email", recipient: email, subject: "Your code", body: "123456", status: "logged" },
    ]);
    await pg`insert into public.otp_requests (email_hash) values (encode(sha256(convert_to(${email}, 'UTF8')), 'hex'))`;
    await pg`insert into public.rate_events (kind, key_hash) values ('signin', ${"k-" + tag})`;
    await pg`insert into public.team_invites (email) values (${email})`;
    await pg`insert into auth.audit_log_entries (id, payload, created_at, ip_address) values (gen_random_uuid(), ${pg.json({ actor_id: u.user!.id, actor_username: email, action: "login" })}, now(), '')`;

    const r = await db.rpc("erase_profile", { p_profile: p, p_rate_keys: ["k-" + tag] });
    assert.ifError(r.error);
    const res = r.data as { user_id: string; offers: { profile_id: string }[] };
    assert.equal(res.user_id, u.user!.id);

    // Nothing left that names them.
    const like = `%${email}%`, likePhone = `%${phone}%`, likeName = `%${name}%`;
    assert.equal(await count(pg`select count(*) from public.notifications where recipient ilike ${like} or subject ilike ${like} or body ilike ${like}
      or body like ${likePhone} or subject ilike ${likeName} or body ilike ${likeName} or error ilike ${like} or provider_ref = 're_1'`), 0);
    assert.equal(await count(pg`select count(*) from public.otp_requests where email_hash = encode(sha256(convert_to(${email}, 'UTF8')), 'hex')`), 0);
    assert.equal(await count(pg`select count(*) from public.rate_events where key_hash = ${"k-" + tag}`), 0);
    assert.equal(await count(pg`select count(*) from public.team_invites where email = ${email}`), 0);
    assert.equal(await count(pg`select count(*) from auth.audit_log_entries where payload->>'actor_username' = ${email}`), 0);
    assert.equal(await count(pg`select count(*) from public.credit_lots where profile_id = ${p} and note is not null`), 0);
    assert.equal(await count(pg`select count(*) from public.credit_ledger where profile_id = ${p} and note is not null`), 0);
    assert.equal(await count(pg`select count(*) from public.lot_freezes where lot_id = ${lot} and reason is not null`), 0);
    const [row] = await pg`select full_name, email, phone, stripe_customer_id, student_verified_until, health_mode, user_id, deleted_at from public.profiles where id = ${p}`;
    assert.deepEqual({ ...row, deleted_at: !!row.deleted_at }, { full_name: "Deleted client", email: null, phone: null, stripe_customer_id: null, student_verified_until: null, health_mode: null, user_id: null, deleted_at: true });
    // Anonymised records stay (accounting), the spot is freed and the first in line is moved in.
    assert.equal(await count(pg`select count(*) from public.bookings where profile_id = ${p}`), 1);
    assert.equal(await count(pg`select count(*) from public.credit_ledger where profile_id = ${p}`) > 0, true);
    assert.deepEqual(res.offers.map((o) => o.profile_id), [other]);
    assert.equal((await db.from("bookings").select("status").eq("session_id", s).eq("profile_id", other).maybeSingle()).data?.status, "confirmed");
    // Erasing twice is refused (nothing to erase).
    assert.equal((await db.rpc("erase_profile", { p_profile: p })).error?.message, "profile_not_found");
    await db.auth.admin.deleteUser(u.user!.id);
  });

  test("the erasure exception only clears ledger notes; it never changes amounts", async () => {
    const p = await client("ledger-exc");
    await grant(p, 2, null, "a note");
    await assert.rejects(pg.begin(async (t) => {
      await t`select set_config('app.erasing', 'on', true)`;
      await t`update public.credit_ledger set delta = delta + 5, note = null where profile_id = ${p}`;
    }), /append-only/);
    await assert.rejects(pg.begin(async (t) => {
      await t`select set_config('app.erasing', 'on', true)`;
      await t`delete from public.credit_ledger where profile_id = ${p}`;
    }), /append-only/);
    await assert.rejects(pg`delete from public.credit_ledger where profile_id = ${p}`, /append-only/);
  });

  test("enforce_retention removes what has passed its period, keeps recent rows and logs counts only", async () => {
    // Everything runs inside one transaction that is rolled back, so the shared test database is untouched.
    const ROLLBACK = new Error("rollback");
    type Result = { counts: Record<string, number>; warn_health: { profile_id: string }[]; warn_inactive: { profile_id: string }[]; erased_users: unknown[] };
    let result = null as Result | null;
    let checks: Record<string, number> = {};
    await assert.rejects(pg.begin(async (t) => {
      const [{ id: oldP }] = await t`insert into public.profiles (full_name, email, created_at) values ('Old Client', ${`old-${Date.now()}@example.com`}, now() - interval '30 months') returning id`;
      const [{ id: newP }] = await t`insert into public.profiles (full_name, email) values ('New Client', ${`new-${Date.now()}@example.com`}) returning id`;
      const [{ id: ct }] = await t`select id from public.class_types where slug = 'reformer'`;
      const [{ id: oldS }] = await t`insert into public.class_sessions (class_type_id, starts_at, ends_at, capacity, price_cents) values (${ct}, now() - interval '5 months', now() - interval '5 months' + interval '50 minutes', 3, 0) returning id`;
      const [{ id: recentS }] = await t`insert into public.class_sessions (class_type_id, starts_at, ends_at, capacity, price_cents) values (${ct}, now() - interval '10 days', now() - interval '10 days' + interval '50 minutes', 3, 0) returning id`;
      await t`insert into public.bookings (profile_id, session_id, status, paid_with, answer, note) values (${newP}, ${oldS}, 'confirmed', 'free', 'veggie', 'note'), (${newP}, ${recentS}, 'confirmed', 'free', 'vegan', 'note')`;
      await t`insert into public.waitlist_entries (profile_id, session_id, status) values (${newP}, ${oldS}, 'left'), (${oldP}, ${recentS}, 'left')`;
      await t`insert into public.notifications (channel, template, recipient, body, status, created_at) values ('email', 'test_email', 'a@example.com', 'old', 'sent', now() - interval '13 months'), ('email', 'test_email', 'b@example.com', 'recent', 'sent', now() - interval '11 months')`;
      await t`insert into public.audit_log (action, created_at) values ('old_thing', now() - interval '25 months'), ('recent_thing', now() - interval '23 months')`;
      await t`insert into public.rate_events (kind, key_hash, created_at) values ('t', 'old', now() - interval '2 days'), ('t', 'recent', now())`;
      // Health answers with no class for 13 months: warned now, deleted only after the notice period.
      await t`insert into public.health_notes (profile_id, conditions, consent_at, updated_at) values (${oldP}, '{}', now() - interval '13 months', now() - interval '13 months')`;
      const first = (await t`select public.enforce_retention() as r`)[0].r;
      result = first;
      checks = {
        oldBookingAnswer: Number((await t`select count(*) from public.bookings where session_id = ${oldS} and answer is not null`)[0].count),
        recentBookingAnswer: Number((await t`select count(*) from public.bookings where session_id = ${recentS} and answer is not null`)[0].count),
        oldWaitlist: Number((await t`select count(*) from public.waitlist_entries where session_id = ${oldS}`)[0].count),
        recentWaitlist: Number((await t`select count(*) from public.waitlist_entries where session_id = ${recentS}`)[0].count),
        oldMessages: Number((await t`select count(*) from public.notifications where body = 'old' and template = 'test_email'`)[0].count),
        recentMessages: Number((await t`select count(*) from public.notifications where body = 'recent' and template = 'test_email'`)[0].count),
        oldAudit: Number((await t`select count(*) from public.audit_log where action = 'old_thing'`)[0].count),
        recentAudit: Number((await t`select count(*) from public.audit_log where action = 'recent_thing'`)[0].count),
        oldRate: Number((await t`select count(*) from public.rate_events where key_hash = 'old'`)[0].count),
        recentRate: Number((await t`select count(*) from public.rate_events where key_hash = 'recent'`)[0].count),
        healthAfterWarning: Number((await t`select count(*) from public.health_notes where profile_id = ${oldP}`)[0].count),
        log: Number((await t`select count(*) from public.audit_log where action = 'retention' and actor_profile_id is null and created_at = now() and not (details::text ilike '%@%')`)[0].count),
        lastRun: Number((await t`select count(*) from public.studio_settings where last_retention_at is not null`)[0].count),
      };
      // 31 days later the notice has run out: the health answers go; the old client was warned and is erased later.
      const later = (await t`select public.enforce_retention(now() + interval '31 days') as r`)[0].r;
      checks.healthAfterNotice = Number((await t`select count(*) from public.health_notes where profile_id = ${oldP}`)[0].count);
      checks.oldClientErased = Number((await t`select count(*) from public.profiles where id = ${oldP} and deleted_at is not null`)[0].count);
      checks.newClientKept = Number((await t`select count(*) from public.profiles where id = ${newP} and deleted_at is null`)[0].count);
      checks.laterErased = later.erased_users.length;
      throw ROLLBACK;
    }), (e) => e === ROLLBACK);
    assert.ok(result);
    assert.deepEqual(checks, {
      oldBookingAnswer: 0, recentBookingAnswer: 1, oldWaitlist: 0, recentWaitlist: 1, oldMessages: 0, recentMessages: 1,
      oldAudit: 0, recentAudit: 1, oldRate: 0, recentRate: 1, healthAfterWarning: 1, log: 1, lastRun: 1,
      healthAfterNotice: 0, oldClientErased: 1, newClientKept: 1, laterErased: 1,
    });
    assert.ok(result!.warn_health.length >= 1);
    assert.ok(result!.warn_inactive.length >= 1);
  });
});

describe("her answers, 7 Nov (A-031, A-033, A-085)", () => {
  const D = 86_400_000;
  const bid = (r: { data: unknown }) => (r.data as { booking_id: string }).booking_id;
  const ledgerOk = async () => {
    const { data: lots } = await db.from("credit_lots").select("id, remaining").order("created_at", { ascending: false }).limit(200);
    for (const l of lots ?? []) {
      const { data: rows } = await db.from("credit_ledger").select("delta").eq("lot_id", l.id);
      assert.equal(l.remaining, (rows ?? []).reduce((n, r) => n + r.delta, 0), `lot ${l.id} out of step with the ledger`);
    }
  };

  test("A-031: the studio cancels a paid event: the payment is marked for a full refund", async () => {
    const p = await client("ans-event");
    const sid = await clientsOnlyEvent(5 * D);
    await db.from("class_sessions").update({ clients_only: false, price_cents: 4000 }).eq("id", sid);
    const r = await book(p, sid, "drop_in", "online", "cash");
    assert.ifError(r.error);
    const pay = (await db.from("payments").select("id").eq("booking_id", bid(r)).single()).data!;
    assert.ifError((await db.rpc("confirm_payment", { p_payment: pay.id, p_provider_ref: undefined as unknown as string, p_method: "cash" })).error);
    const { data: told, error } = await db.rpc("cancel_session", { p_session: sid, p_reason: "test" });
    assert.ifError(error);
    assert.equal(told?.length, 1);
    assert.equal((await db.from("payments").select("status").eq("id", pay.id).single()).data?.status, "needs_refund");
    assert.equal(await balance(p), 0); // money back, not a class
  });

  test("A-033: a late cancel gets the class back when the studio then cancels that class", async () => {
    const p = await client("ans-late");
    const lot = await grant(p, 2, 30 * D);
    const sid = await session(2 * 3_600_000);
    const b = bid(await book(p, sid));
    assert.equal(((await db.rpc("cancel_booking", { p_booking: b, p_profile: p })).data as { status: string }).status, "late_cancelled");
    assert.equal(await lotRemaining(lot), 1);
    const { data: told, error } = await db.rpc("cancel_session", { p_session: sid, p_reason: "test" });
    assert.ifError(error);
    assert.deepEqual(told?.map((t) => t.booking_id), [b]); // they're told their class is back
    assert.equal((await db.from("bookings").select("status").eq("id", b).single()).data?.status, "studio_cancelled");
    assert.equal(await lotRemaining(lot), 2);
    const { data: back } = await db.from("credit_ledger").select("delta, note").eq("booking_id", b).eq("entry_type", "cancel_refund");
    assert.deepEqual(back, [{ delta: 1, note: "studio_cancel" }]);
    // Cancelling again changes nothing.
    assert.ifError((await db.rpc("cancel_session", { p_session: sid, p_reason: "again" })).error);
    assert.equal(await lotRemaining(lot), 2);
    await ledgerOk();
  });

  test("A-085: the studio removes someone inside 6h: a late cancel by default, or the class back if she chooses", async () => {
    const p = await client("ans-remove");
    const lot = await grant(p, 3, 30 * D);
    const late1 = bid(await book(p, await session(2 * 3_600_000 + 1000)));
    const r1 = await db.rpc("cancel_booking", { p_booking: late1, p_profile: p, p_admin: true });
    assert.ifError(r1.error);
    assert.equal((r1.data as { status: string }).status, "late_cancelled");
    assert.equal(await lotRemaining(lot), 2);

    const late2 = bid(await book(p, await session(2 * 3_600_000 + 2000)));
    const r2 = await db.rpc("cancel_booking", { p_booking: late2, p_profile: p, p_admin: true, p_return_credit: true });
    assert.equal((r2.data as { status: string }).status, "cancelled");
    assert.equal(await lotRemaining(lot), 2);

    // More than 6h before class nothing changes: the class goes back.
    const early = bid(await book(p, await session(2 * D)));
    const r3 = await db.rpc("cancel_booking", { p_booking: early, p_profile: p, p_admin: true });
    assert.equal((r3.data as { status: string }).status, "cancelled");
    assert.equal(await lotRemaining(lot), 2);
    await ledgerOk();
  });
});

describe("WP8: versioned legal texts and acceptance (A-009, A-060)", () => {
  const rec = async (doc: string, body: string) => {
    const { data, error } = await db.rpc("record_policy_version", { p_doc: doc, p_body: body });
    assert.ifError(error);
    return data as { id: string; version: number };
  };

  test("a changed text gets a new version; the same text doesn't", async () => {
    const tag = `${Date.now()}-${Math.random()}`;
    const a = await rec("terms", `## Terms\nOne ${tag}`);
    assert.deepEqual(await rec("terms", `## Terms\nOne ${tag}`), a);
    const b = await rec("terms", `## Terms\nTwo ${tag}`);
    assert.notEqual(b.id, a.id);
    assert.equal(b.version, a.version + 1);
    assert.equal((await db.from("policy_versions").select("body").eq("id", a.id).single()).data?.body, `## Terms\nOne ${tag}`);
    assert.ok((await db.from("policy_versions").update({ body: "x" }).eq("id", a.id)).error, "versions can't be edited");
  });

  test("sign-up records one acceptance per document with its version, and no fitness declaration", async () => {
    const p = await client("wp8-onboard");
    const docs = [];
    for (const doc of ["terms", "studio_rules", "payments_policy", "waiver"]) docs.push({ doc, id: (await rec(doc, `${doc} text for the engine test`)).id });
    const args = { p_profile: p, p_first: "A", p_last: "B", p_full: "A B", p_phone: "+357 99 123456", p_dob: "1990-01-01", p_email: `wp8-${Date.now()}@example.com`, p_photo: "none", p_marketing: false, p_version: "v" };
    assert.equal((await db.rpc("onboard_profile", { ...args, p_docs: docs.slice(0, 3) as unknown as Json })).error?.message, "documents_not_accepted");
    assert.ifError((await db.rpc("onboard_profile", { ...args, p_docs: docs as unknown as Json })).error);
    const { data: rows } = await db.from("consents").select("type, granted, doc_version_id").eq("profile_id", p);
    const accepted = (rows ?? []).filter((r) => r.doc_version_id).map((r) => [r.type, r.doc_version_id]).sort();
    assert.deepEqual(accepted, docs.map((d) => [d.doc, d.id]).sort());
    assert.ok(!(rows ?? []).some((r) => r.type === "fitness_declaration"));
  });
});

describe("WP8: adults only (A-062)", () => {
  test("nobody under 18 on the day of the class can be booked, online or by the studio", async () => {
    const p = await client("wp8-minor");
    const sid = await session(3 * 86_400_000);
    const classDay = new Date(Date.now() + 3 * 86_400_000);
    // 18 the day after the class (studio time): refused; 18 on the day itself: allowed.
    const dob = (daysAfterClass: number) => {
      const d = new Date(classDay.getTime() + daysAfterClass * 86_400_000);
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(d);
      return `${Number(key.slice(0, 4)) - 18}${key.slice(4)}`;
    };
    await db.from("profiles").update({ date_of_birth: dob(1) }).eq("id", p);
    await grant(p, 2, 30 * 86_400_000);
    assert.equal((await book(p, sid)).error?.message, "minor_not_allowed");
    assert.equal((await book(p, sid, "manual", "manual")).error?.message, "minor_not_allowed");
    await db.from("profiles").update({ date_of_birth: dob(0) }).eq("id", p);
    assert.ifError((await book(p, sid)).error);
  });
});

// ---------------------------------------------------------------------------
// WP11: direct access with the public anon key, signed out or as a client (A-041, A-086).
// The app itself only uses the service role; this is what anyone holding the anon key gets.
// ---------------------------------------------------------------------------
describe("RLS: anon key and client JWTs (A-041, A-086)", () => {
  const pg = postgres(env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  after(() => pg.end());
  const anonClient = () => createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  /** A confirmed login with a linked client profile, signed in on its own anon-key client. */
  async function signedIn(tag: string) {
    const email = `rls-${tag}-${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { data: u, error } = await db.auth.admin.createUser({ email, password: "pw-12345678", email_confirm: true });
    assert.ifError(error);
    const id = (await db.from("profiles").select("id").eq("user_id", u.user!.id).single()).data!.id;
    const c = anonClient();
    assert.ifError((await c.auth.signInWithPassword({ email, password: "pw-12345678" })).error);
    return { id, c };
  }
  async function withData(tag: string) {
    const who = await signedIn(tag);
    await grant(who.id, 2, 30 * 24 * H);
    assert.ifError((await book(who.id, await session(72 * H))).error);
    assert.ifError((await db.from("payments").insert({ profile_id: who.id, provider: "offline", amount_cents: 100, purpose: "pack", description: "RLS test" })).error);
    assert.ifError((await db.from("health_notes").insert({ profile_id: who.id, consent_at: new Date().toISOString() })).error);
    return who;
  }
  const own = ["bookings", "payments", "credit_lots", "credit_ledger", "health_notes", "consents", "waitlist_entries"] as const;

  test("client A reads only A's rows; client B and anon read none of A's", async () => {
    const a = await withData("a");
    const b = await signedIn("b");
    const anon = anonClient();
    for (const t of own) {
      const mine = await a.c.from(t).select("profile_id");
      assert.ifError(mine.error);
      assert.ok(mine.data!.every((r) => r.profile_id === a.id), `${t}: A sees only own rows`);
      const theirs = await b.c.from(t).select("profile_id").eq("profile_id", a.id);
      assert.ifError(theirs.error);
      assert.equal(theirs.data!.length, 0, `${t}: B can't see A's rows`);
      const out = await anon.from(t).select("profile_id").eq("profile_id", a.id);
      assert.equal(out.data?.length ?? 0, 0, `${t}: anon sees nothing`);
    }
    for (const t of ["bookings", "payments", "credit_lots", "health_notes"] as const)
      assert.ok((await a.c.from(t).select("profile_id")).data!.length >= 1, `${t}: A sees their own row`);
    assert.equal((await b.c.from("profiles").select("id").eq("id", a.id)).data!.length, 0, "B can't read A's profile");
    assert.equal((await a.c.from("profiles").select("id")).data!.length, 1, "A reads only their own profile");
    for (const t of ["notifications", "audit_log", "health_history", "rate_events", "otp_requests", "discount_codes"] as const)
      assert.equal(((await a.c.from(t as "notifications").select("id")).data ?? []).length, 0, `${t}: nothing for a client`);
  });

  test("engine functions can't be executed with the anon key or a client JWT", async () => {
    const a = await signedIn("rpc");
    const s = await session(72 * H);
    for (const c of [anonClient(), a.c]) {
      for (const [fn, args] of [
        ["book_session", { p_profile: a.id, p_session: s, p_mode: "credit", p_source: "online" }],
        ["grant_lot", { p_profile: a.id, p_kind: "reformer", p_credits: 5, p_expires: null, p_note: "x" }],
        ["confirm_payment", { p_payment: a.id }],
        ["erase_profile", { p_profile: a.id }],
      ] as const) {
        const r = await c.rpc(fn as "grant_lot", args as never);
        assert.ok(r.error, `${fn} must be refused`);
      }
    }
    assert.equal(await balance(a.id), 0);
  });

  test("clients-only events and private sessions are hidden from people who can't see them", async () => {
    const ev = await clientsOnlyEvent(96 * H);
    const privType = (await db.from("class_types").select("id").eq("private", true).limit(1).single()).data!.id;
    const priv = (await db.from("class_sessions").insert({ class_type_id: privType, starts_at: iso(100 * H), ends_at: iso(101 * H), capacity: 1, title: "Private RLS" }).select("id").single()).data!.id;
    const open = await session(98 * H);
    const anon = anonClient();
    const seen = async (c: ReturnType<typeof anonClient>, id: string) => (await c.from("class_sessions").select("id, description, event_policy").eq("id", id)).data?.length ?? 0;
    assert.equal(await seen(anon, open), 1, "regular classes stay public");
    assert.equal(await seen(anon, ev), 0, "anon can't read a clients-only event");
    assert.equal(await seen(anon, priv), 0, "anon can't read a private session");
    const stranger = await signedIn("stranger");
    assert.equal(await seen(stranger.c, ev), 0, "a non-client can't read it");
    assert.equal(await seen(stranger.c, priv), 0);
    const member = await signedIn("member");
    await grant(member.id, 2, 30 * 24 * H);
    assert.equal(await seen(member.c, ev), 1, "a studio client reads the event");
    assert.equal(await seen(member.c, priv), 0, "but not someone else's private session");
  });

  test("anon reads class types and products without errors, and only public studio settings", async () => {
    const anon = anonClient();
    for (const t of ["class_types", "products", "credit_kinds", "package_tabs", "site_content", "media", "closures"] as const) {
      const r = await anon.from(t).select("*").limit(1);
      assert.ifError(r.error);
    }
    const raw = await anon.from("studio_settings").select("alert_email, bank_iban, last_tick_error");
    assert.ok(raw.error || (raw.data ?? []).length === 0, "private settings columns are not readable");
    const pub = await anon.from("studio_public").select("*").single();
    assert.ifError(pub.error);
    const keys = Object.keys(pub.data!);
    assert.ok(keys.includes("studio_name") && keys.includes("intro_line"));
    for (const k of ["alert_email", "bank_iban", "revolut_link", "last_tick_error", "last_cron_tick_at", "retention_health_months"]) assert.ok(!keys.includes(k), `${k} is not public`);
  });

  test("clients and anon can't write the server-only tables", async () => {
    const a = await signedIn("write");
    for (const c of [anonClient(), a.c]) {
      assert.ok((await c.from("compliance_items").insert({ key: `rls-${Date.now()}` })).error, "compliance_items");
      assert.ok((await c.from("health_notes").insert({ profile_id: a.id, consent_at: new Date().toISOString() })).error, "health_notes");
      assert.ok((await c.from("consents").insert({ profile_id: a.id, consent_type: "photos", granted: true } as never)).error, "consents");
      assert.ok((await c.from("timetable_templates").insert({} as never)).error, "timetable_templates");
    }
    const grants = await pg`select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and (privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
          or (privilege_type <> 'SELECT' and table_name in ('health_notes', 'health_history', 'consents', 'compliance_items', 'template_slots', 'timetable_templates')))`;
    assert.deepEqual([...grants], [], "no TRUNCATE/TRIGGER/REFERENCES, and no writes on health, consent or admin tables");
  });

  test("TRUNCATE credit_ledger is refused even for the database owner", async () => {
    const before = Number((await pg`select count(*)::int n from credit_ledger`)[0].n);
    let msg = "";
    try {
      await pg.begin(async (sql) => {
        await sql`truncate public.credit_ledger cascade`;
        throw new Error("rolled_back");
      });
    } catch (e) { msg = (e as Error).message; }
    assert.match(msg, /append-only|append_only/i);
    assert.equal(Number((await pg`select count(*)::int n from credit_ledger`)[0].n), before);
  });
});
