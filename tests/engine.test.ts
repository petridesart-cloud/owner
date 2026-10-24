// Booking-engine tests against the local Supabase (npx supabase start && npx supabase db reset).
// Run: npm run test:engine
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
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
    // A frees the spot, then the waitlist is processed (the app does both on cancel).
    await db.rpc("cancel_booking", { p_booking: (ra.data as { booking_id: string }).booking_id, p_profile: a, p_admin: true });
    const { data: rows, error } = await db.rpc("process_waitlist", { p_session: sid });
    assert.ifError(error);
    return { sid, b, rows: (rows ?? []) as { profile_id: string; offer_expires_at: string | null }[] };
  };

  test("a spot that opens more than 6h ahead auto-books the first in line who has a class", async () => {
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

  test("inside the 6h cutoff nobody is auto-booked; they get an offer until class time", async () => {
    const { b, rows } = await waitFor(3 * H, 2);
    assert.equal(rows[0].profile_id, b);
    assert.ok(rows[0].offer_expires_at);
    assert.ok(new Date(rows[0].offer_expires_at!).getTime() <= Date.now() + 3 * H + 60_000);
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

