"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { parse, payMethod, uuid } from "@/lib/validate";
import { monthsLabel } from "@/lib/copy";
import { parseSettingsNumbers } from "@/lib/settings-form";
import { canViewHealth, getSettings, requireAdmin } from "@/lib/auth";
import { emailLive, env, paymentsLive } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { EVENT_POLICY, cancelBooking, cancelSession, cancelSessions, notifyCancelled, notifyOffers, onPaymentPaid, policyLine, runTick, sessionInfo } from "@/lib/booking";
import { later, notify, pool, retryFailed } from "@/lib/notifications";
import { applyRecurring } from "@/lib/recurring";
import { rewardCode } from "@/lib/rewards";
import { eraseProfile } from "@/lib/erase";
import { defaultTerms } from "@/lib/terms";
import { getKinds, kindLabel } from "@/lib/kinds";
import { discountLabel, normaliseCode, targetsLabel } from "@/lib/discount";
import { ERROR_KEYS, friendlyError, must, type ActionResult } from "@/lib/errors";
import { addDaysKey, dotDate, importDateKey, keyToDate, localToUtc, spokenDateTime, todayKey } from "@/lib/time";
import type { Json } from "@/lib/supabase/types";

async function admin(action: string, details?: Record<string, unknown>) {
  const viewer = await requireAdmin();
  // A-054: no studio change without its audit entry (the error page explains; nothing else ran yet).
  must(await db().from("audit_log").insert({ actor_profile_id: viewer.profile.id, action, details: (details ?? null) as Json }), "audit_log");
  return viewer;
}

/** A-066: studio only, then the arguments are checked (before anything reaches the audit log). */
async function check<S extends z.ZodType>(schema: S, input: unknown) {
  await requireAdmin();
  return parse(schema, input);
}

/** A-054: a write that fails turns into an error result instead of a silent "Saved". */
function failed(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  console.error("admin action failed", e);
  return { ok: false, error: friendlyError(e) };
}

// ── Check-in & roster ──────────────────────────────────────────────────
export async function toggleCheckIn(bookingId: string, checked: boolean): Promise<ActionResult> {
  const a = await check(z.object({ bookingId: uuid, checked: z.boolean() }), { bookingId, checked });
  if (!a.ok) return a;
  await admin("check_in", { bookingId, checked });
  const { error } = await db().from("bookings").update({ checked_in_at: checked ? new Date().toISOString() : null }).eq("id", bookingId);
  if (error) return failed(error);
  revalidatePath("/admin");
  return { ok: true };
}

/** Her answer: attendance stays editable (attended / no-show / not marked), in case of a mistake. */
export async function setAttendance(bookingId: string, state: "attended" | "no_show" | "unmarked"): Promise<ActionResult> {
  const a = await check(z.object({ bookingId: uuid, state: z.enum(["attended", "no_show", "unmarked"]) }), { bookingId, state });
  if (!a.ok) return a;
  await admin("attendance", { bookingId, state });
  const { data: b } = await db().from("bookings").select("status, checked_in_at, class_sessions(starts_at)").eq("id", bookingId).single();
  if (!b || !["confirmed", "no_show"].includes(b.status)) return { ok: false, error: "This booking can't be marked. Please refresh." };
  // Only once the class has started (A-083): before that a no-show would free the spot without the waitlist.
  if (!b.class_sessions || new Date(b.class_sessions.starts_at) > new Date()) return { ok: false, error: friendlyError("class_not_started") };
  const { error } = await db().from("bookings").update(
    state === "attended" ? { status: "confirmed", checked_in_at: b.checked_in_at ?? new Date().toISOString() }
    : state === "no_show" ? { status: "no_show", checked_in_at: null }
    : { status: "confirmed", checked_in_at: null },
  ).eq("id", bookingId);
  if (error) return failed(error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function markNoShow(bookingId: string): Promise<ActionResult> {
  const a = await check(z.object({ bookingId: uuid }), { bookingId });
  if (!a.ok) return a;
  await admin("no_show", { bookingId });
  const { data: b } = await db().from("bookings").select("class_sessions(starts_at)").eq("id", bookingId).single();
  if (!b?.class_sessions || new Date(b.class_sessions.starts_at) > new Date()) return { ok: false, error: friendlyError("class_not_started") }; // A-083: Remove is for upcoming classes
  const { error } = await db().from("bookings").update({ status: "no_show", checked_in_at: null }).eq("id", bookingId).eq("status", "confirmed");
  if (error) return failed(error);
  revalidatePath("/admin");
  return { ok: true };
}

/** Remove someone from a class. Inside the cutoff it's a late cancel unless she chooses to return the class (A-085). */
export async function adminCancelBooking(bookingId: string, sessionId: string, returnClass = false): Promise<ActionResult> {
  const a = await check(z.object({ bookingId: uuid, sessionId: uuid, returnClass: z.boolean() }), { bookingId, sessionId, returnClass });
  if (!a.ok) return a;
  const viewer = await admin("cancel_booking", { bookingId, returnClass });
  const res = await cancelBooking(viewer.profile, bookingId, true, returnClass === true);
  revalidatePath(`/admin/classes/${sessionId}`);
  return res.ok ? { ok: true } : res;
}

const NewClient = z.object({
  first_name: z.string().trim().min(1, "Name is required").max(60),
  last_name: z.string().trim().max(60).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
});

/** Add someone to a class or event by hand (from DMs or the phone): an existing client, or someone new with their details. */
export async function manualBook(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("manual_book", { sessionId });
  let profileId = String(form.get("profile_id") ?? "");
  if (!profileId) {
    const parsed = NewClient.safeParse({ first_name: form.get("first_name") ?? "", last_name: form.get("last_name") ?? "", email: form.get("email") ?? "", phone: form.get("phone") ?? "" });
    if (!parsed.success) return { ok: false, error: "Pick a client, or enter at least the name of someone new." };
    // A-062: classes are for adults; she confirms it for someone without a date of birth on file.
    if (form.get("adult") !== "on") return { ok: false, error: "Please confirm they're 18 or over: classes are for adults." };
    const { first_name, last_name, phone } = parsed.data;
    const email = parsed.data.email || null;
    const existing = email ? (await db().from("profiles").select("id").eq("email", email).is("deleted_at", null).maybeSingle()).data : null;
    if (existing) profileId = existing.id;
    else {
      const { data, error } = await db().from("profiles").insert({
        first_name, last_name: last_name || null, full_name: [first_name, last_name].filter(Boolean).join(" "), email, phone: phone || null,
      }).select("id").single();
      if (error) return { ok: false, error: "Couldn't add them. Is that email already used by someone else?" };
      profileId = data.id;
    }
  }
  const choice = String(form.get("mode") ?? "manual");
  const mode = choice === "credit" ? "credit" : choice === "unpaid" ? "pay_at_studio" : choice === "free" ? "free" : "manual";
  const { data, error } = await db().rpc("book_session", { p_profile: profileId, p_session: sessionId, p_mode: mode, p_source: "manual" });
  if (error) return { ok: false, error: friendlyError(error) };
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (note) await db().from("bookings").update({ note }).eq("id", (data as { booking_id: string }).booking_id);
  if (form.get("notify") === "on") {
    const who = profileId!;
    later("manual booking email", async () => {
      const [{ data: p }, s] = await Promise.all([db().from("profiles").select("*").eq("id", who).single(), sessionInfo(sessionId)]);
      if (p) await notify({ profileId: p.id, email: p.email, phone: p.phone }, "booking_confirmed",
        { name: p.full_name ?? undefined, className: s.name, when: spokenDateTime(s.starts_at), location: s.where,
          policy: s.type.kind === "event" ? s.event_policy ?? EVENT_POLICY : policyLine(s.cancelBy, s.cutoff) },
        { bookingId: (data as { booking_id: string }).booking_id, sessionId });
    });
  }
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: mode === "pay_at_studio" ? "Added. It's under Awaiting payment on Today until you mark it paid." : "Added." };
}

// ── Classes ────────────────────────────────────────────────────────────
const SessionForm = z.object({
  class_type_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.coerce.number().int().min(10).max(600),
  capacity: z.coerce.number().int().min(1).max(100),
  price: z.string().optional(),
  title: z.string().trim().max(80).optional(),
  location: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  what_to_bring: z.string().trim().max(600).optional(),
  event_policy: z.string().trim().max(1500).optional(),
  recap: z.string().trim().max(600).optional(),
  signup_question: z.string().trim().max(200).optional(),
  title_font: z.enum(["calligraphy", "handwritten", "minimal", "simple", "elegant", "bold"]).optional(),
});

function sessionRow(form: FormData) {
  const p = SessionForm.safeParse(Object.fromEntries(form));
  if (!p.success) return null;
  const starts = localToUtc(p.data.date, p.data.time);
  // A-065: a price is euros with at most 2 decimals (no NaN, nothing negative); empty = the class type's price.
  const cents = p.data.price ? priceCents(p.data.price) : null;
  if (p.data.price && cents === null) return null;
  return {
    class_type_id: p.data.class_type_id,
    starts_at: starts,
    ends_at: new Date(new Date(starts).getTime() + p.data.duration * 60_000).toISOString(),
    capacity: p.data.capacity,
    price_cents: cents,
    title: p.data.title || null,
    location: p.data.location || null,
    description: p.data.description || null,
    clients_only: form.get("clients_only") === "on",
    what_to_bring: p.data.what_to_bring || null,
    event_policy: p.data.event_policy || null,
    recap: p.data.recap || null,
    signup_question: p.data.signup_question || null,
    title_font: p.data.title_font ?? null,
  };
}

/** Events have no price on their type: each event needs its own fee (0 = free). */
async function eventNeedsFee(row: { class_type_id: string; price_cents: number | null }) {
  if (row.price_cents != null) return false;
  const { data } = await db().from("class_types").select("kind").eq("id", row.class_type_id).single();
  return data?.kind === "event";
}

export async function createSession(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("create_session");
  const row = sessionRow(form);
  if (!row) return { ok: false, error: "Please check the date, time, duration and capacity." };
  if (await eventNeedsFee(row)) return { ok: false, error: "Set the event fee (0 for a free event)." };
  const { data, error } = await db().from("class_sessions").insert(row).select("id").single();
  if (error) return { ok: false, error: error.code === "23505" ? "A class of that type already exists at that time." : "Couldn't create the class." };
  redirect(`/admin/classes/${data.id}`);
}

export async function updateSession(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("update_session", { sessionId });
  const row = sessionRow(form);
  if (!row) return { ok: false, error: "Please check the fields." };
  if (await eventNeedsFee(row)) return { ok: false, error: "Set the event fee (0 for a free event)." };
  // Capacity, class type, closures and booked clients' packages are checked in one locked step (A-039);
  // more capacity moves the waitlist up in the same step.
  const { data, error } = await db().rpc("update_session", { p_session: sessionId, p_patch: row as unknown as Json });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "A class of that type already exists at that time." };
    if (error.message === "capacity_below_booked") {
      const { data: taken } = await db().rpc("spots_taken", { p_session: sessionId });
      return { ok: false, error: `${taken} spot${taken === 1 ? " is" : "s are"} taken (booked or held), so capacity can't go below that.` };
    }
    return { ok: false, error: error.message in ERROR_KEYS ? friendlyError(error) : "Couldn't save changes." };
  }
  const res = data as { booked: number; moved: boolean; offers: { entry_id: string; profile_id: string; offer_expires_at: string | null }[] };
  later("waitlist offers", () => notifyOffers(res.offers ?? []));
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: res.moved && res.booked ? `Saved. ${res.booked} client${res.booked === 1 ? " is" : "s are"} booked: let them know about the new time.` : "Saved." };
}

export async function cancelSessionAction(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("cancel_session", { sessionId });
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  const n = await cancelSession(sessionId, reason);
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: `Class cancelled. ${n} client${n === 1 ? "" : "s"} notified and their classes returned.` };
}

/** Clients-only events: let someone without an active package see and book this event. */
export async function allowEventAccess(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("event_access_add", { sessionId });
  const profileId = String(form.get("profile_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(profileId)) return { ok: false, error: "Choose a client." };
  const { error } = await db().from("event_access").upsert({ session_id: sessionId, profile_id: profileId });
  if (error) return { ok: false, error: "Couldn't add them." };
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: "Added. They can now see and book this event." };
}

export async function removeEventAccess(sessionId: string, profileId: string): Promise<ActionResult> {
  const a = await check(z.object({ sessionId: uuid, profileId: uuid }), { sessionId, profileId });
  if (!a.ok) return a;
  await admin("event_access_remove", { sessionId, profileId });
  const { error } = await db().from("event_access").delete().eq("session_id", sessionId).eq("profile_id", profileId);
  if (error) return failed(error);
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: "Removed." };
}

// ── Timetable ──────────────────────────────────────────────────────────
const Slot = z.object({ weekday: z.number().int().min(1).max(7), time: z.string().regex(/^\d{2}:\d{2}$/), class_type_id: z.string().uuid(), capacity: z.number().int().min(1).max(100).nullable().optional() });

export async function saveTimetable(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_timetable");
  const from = String(form.get("valid_from"));
  let rawSlots: unknown = [];
  try { rawSlots = JSON.parse(String(form.get("slots") ?? "[]")); } catch { return { ok: false, error: "The class times couldn't be read. Please reload the page and try again." }; }
  const slots = z.array(Slot).safeParse(rawSlots);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false, error: "Pick the date it starts." };
  if (!slots.success || slots.data.length === 0) return { ok: false, error: "Add at least one class time." };
  // A-095: on the Sunday the clocks go forward, 03:00-03:59 doesn't exist, so a Sunday class then would move.
  if (slots.data.some((s) => s.weekday === 7 && s.time >= "03:00" && s.time < "04:00")) return { ok: false, error: "Sunday classes can't start between 03:00 and 03:59: that hour doesn't exist when the clocks change. Pick another time." };
  const name = String(form.get("name") ?? "").trim() || `Timetable from ${from}`;
  // It repeats every week from the start date; each tick tops it up to ~9 weeks ahead (extend_timetable).
  // Template, slots, retiring the old timetable and creating classes happen in one transaction (A-054).
  const unique = new Map(slots.data.map((s) => [`${s.weekday}-${s.time}`, s]));
  const { data: kept, error } = await db().rpc("save_timetable", {
    p_name: name, p_from: from, p_slots: [...unique.values()].map((s) => ({ ...s, capacity: s.capacity ?? null })) as unknown as Json,
  });
  if (error) {
    console.error("save_timetable failed", error);
    return { ok: false, error: error.message in ERROR_KEYS ? friendlyError(error) : "Couldn't save the timetable. Nothing was changed." };
  }
  await applyRecurring(undefined, { defer: true });
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/classes");
  return { ok: true, message: `Saved. Your classes now repeat every week from ${from}.${kept ? ` ${kept} class${kept === 1 ? "" : "es"} from the old timetable already ${kept === 1 ? "has" : "have"} bookings and ${kept === 1 ? "was" : "were"} kept: check them in Classes.` : ""}` };
}

// ── Clients ────────────────────────────────────────────────────────────
/** She has seen the doctor's written clearance (pregnancy / recent surgery). */
export async function clearanceReceived(profileId: string): Promise<ActionResult> {
  await admin("clearance_received", { profileId });
  const { error } = await db().from("health_notes").update({ clearance_received_at: todayKey() }).eq("profile_id", profileId);
  if (error) return failed(error);
  revalidatePath(`/admin/clients/${profileId}`);
  revalidatePath("/admin");
  return { ok: true, message: "Noted: doctor's note received." };
}

export async function updateClient(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("update_client", { profileId });
  // Two forms post here (contact details, and notes): only what was sent is changed.
  const row: { full_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null; admin_notes?: string | null } = {};
  if (form.has("email")) {
    const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
    if (email && !z.string().email().safeParse(email).success) return { ok: false, error: "Invalid email." };
    row.email = email;
  }
  if (form.has("full_name")) {
    const name = String(form.get("full_name") ?? "").trim();
    Object.assign(row, { full_name: name || null, first_name: name.split(" ")[0] || null, last_name: name.split(" ").slice(1).join(" ") || null });
  }
  if (form.has("phone")) row.phone = String(form.get("phone") ?? "").trim() || null;
  if (form.has("admin_notes")) row.admin_notes = String(form.get("admin_notes") ?? "").trim() || null;
  const { error } = await db().from("profiles").update(row).eq("id", profileId);
  if (error) return { ok: false, error: error.code === "23505" ? "Another client already uses that email." : "Couldn't save." };
  revalidatePath(`/admin/clients/${profileId}`);
  return { ok: true, message: "Saved." };
}


/** Extend, freeze, end earlier, add or remove classes on one package. */
export async function adjustLot(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await admin("adjust_lot", { profileId, action: form.get("action"), lot: form.get("lot") });
  const action = String(form.get("action") ?? "");
  const lot = String(form.get("lot") ?? "");
  let n = Number(form.get("amount") || 0);
  const date = String(form.get("date") ?? "");
  if (action === "freeze") {
    // From–To (both included).
    const to = String(form.get("to") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < date) return { ok: false, error: "Pick the first and last day of the freeze." };
    n = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000) + 1;
  }
  const reason = String(form.get("reason") ?? "").trim();
  if (!["extend", "freeze", "end", "add", "remove"].includes(action) || !/^[0-9a-f-]{36}$/.test(lot)) return { ok: false, error: "Choose a package and what to change." };
  const { data: owned } = await db().from("credit_lots").select("id").eq("id", lot).eq("profile_id", profileId).maybeSingle();
  if (!owned) return { ok: false, error: "Choose one of this client's packages." };
  const { error } = await db().rpc("admin_adjust_lot", {
    p_lot: lot, p_action: action, p_days: action === "extend" || action === "freeze" ? n : 0, p_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    p_credits: action === "add" || action === "remove" ? n : 0, p_reason: reason, p_actor: viewer.profile.id,
  });
  if (error) return { ok: false, error: error.message in ERROR_KEYS ? friendlyError(error) : "Couldn't change the package." };
  revalidatePath(`/admin/clients/${profileId}`);
  const done: Record<string, string> = {
    extend: `Extended by ${n} day${n === 1 ? "" : "s"}.`, freeze: `Frozen for ${n} day${n === 1 ? "" : "s"}: no bookings with this package in those days, and the end date moved by the same.`,
    end: "The package now ends on that date.", add: `Added ${n} class${n === 1 ? "" : "es"}.`, remove: `Removed ${n} class${n === 1 ? "" : "es"}.`,
  };
  return { ok: true, message: done[action] };
}

/** Her own happy-birthday email, one client at a time. */
export async function sendBirthday(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("send_birthday", { profileId });
  const message = String(form.get("message") ?? "").trim().slice(0, 1500);
  if (!message) return { ok: false, error: "Write a message first." };
  const { data: p } = await db().from("profiles").select("id, email, full_name").eq("id", profileId).is("deleted_at", null).maybeSingle();
  if (!p?.email) return { ok: false, error: "This client has no email address." };
  const year = todayKey().slice(0, 4);
  const r = await notify({ profileId: p.id, email: p.email }, "birthday", { name: p.full_name ?? undefined, note: message }, { dedupeKey: `birthday:${year}:${p.id}` });
  if (r.email === "duplicate") return { ok: false, error: "You already sent them a birthday message this year." };
  if (r.email === "failed") return { ok: false, error: "The email couldn't be sent. Check Settings → Messages." };
  revalidatePath(`/admin/clients/${profileId}`);
  return { ok: true, message: r.email === "sent" ? "Sent. 🎂" : "Saved to Messages (demo: not emailed)." };
}

/** Classes outside their packages (goodwill, a missed holiday class) with their own end date. */
export async function giveClasses(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await admin("give_classes", { profileId });
  const kind = String(form.get("kind") ?? "");
  if (!(await getKinds()).some((k) => k.key === kind)) return { ok: false, error: "Choose what the classes are for." };
  const amount = Number(form.get("amount"));
  const until = String(form.get("date") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!Number.isInteger(amount) || amount < 1 || amount > 50) return { ok: false, error: "Enter between 1 and 50 classes." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < todayKey()) return { ok: false, error: "Pick the last day they can use them (today or later)." };
  if (!reason) return { ok: false, error: "Please add a reason (it's kept in the client's history)." };
  const { error } = await db().rpc("grant_lot", {
    p_profile: profileId, p_kind: kind, p_credits: amount, p_expires: localToUtc(addDaysKey(until, 1), "00:00"), p_note: reason,
    p_entry: "admin_adjustment", p_actor: viewer.profile.id,
  });
  if (error) return { ok: false, error: "Couldn't add the classes." };
  revalidatePath(`/admin/clients/${profileId}`);
  return { ok: true, message: `Gave ${amount} ${await kindLabel(kind)} class${amount === 1 ? "" : "es"}, usable until ${dotDate(keyToDate(until))}.` };
}

// ── Rewards and discount codes ─────────────────────────────────────────
/** % (1–100), € (cents) or free classes (1–10), read from a form. */
function readDiscount(form: FormData): { kind: "percent" | "amount" | "free_classes"; value: number; applies_to: string[] } | string {
  const kind = String(form.get("kind") ?? "");
  const n = Number(String(form.get("value") ?? "").replace(",", "."));
  // What it applies to (her ticks); free classes only make sense on a package.
  const picked = [...new Set(form.getAll("applies_to").map(String))].filter((t) => ["package", "trial", "drop_in", "event"].includes(t));
  const applies_to = kind === "free_classes" ? ["package"] : picked;
  if (!applies_to.length) return "Tick at least one: trial, drop-in, package or event.";
  if (kind === "percent") return Number.isInteger(n) && n >= 1 && n <= 100 ? { kind, value: n, applies_to } : "Enter a percentage between 1 and 100.";
  if (kind === "amount") return n > 0 && n <= 1000 ? { kind, value: Math.round(n * 100), applies_to } : "Enter an amount in euro, e.g. 10.";
  if (kind === "free_classes") return Number.isInteger(n) && n >= 1 && n <= 10 ? { kind, value: n, applies_to } : "Enter between 1 and 10 classes.";
  return "Choose what the reward gives.";
}
const readDate = (form: FormData, key: string) => { const v = String(form.get(key) ?? ""); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };

/** A personal reward for one client: used once, on their next package, applied automatically. They get an email. */
export async function giveReward(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await admin("give_reward", { profileId });
  const d = readDiscount(form);
  if (typeof d === "string") return { ok: false, error: d };
  const until = readDate(form, "expires_on");
  if (until && until < todayKey()) return { ok: false, error: "Pick an end date from today on, or leave it empty." };
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  const { data: p } = await db().from("profiles").select("id, email, full_name").eq("id", profileId).is("deleted_at", null).maybeSingle();
  if (!p) return { ok: false, error: "Client not found." };
  const { error } = await db().from("discount_codes").insert({
    code: rewardCode(), kind: d.kind, value: d.value, applies_to: d.applies_to, profile_id: p.id, note, expires_on: until, max_uses: 1, created_by: viewer.profile.id,
  });
  if (error) return { ok: false, error: "Couldn't save the reward. Please try again." };
  const on = d.applies_to.length === 1 && d.applies_to[0] === "package" ? "your next package" : `your next ${targetsLabel(d.applies_to).replace(/s(?=,| and|$)/g, "").replace(/ and /g, " or ")}`;
  const what = `${discountLabel(d.kind, d.value)}${d.kind === "free_classes" ? " added to" : " on"} ${on}${until ? `, until ${dotDate(keyToDate(until))}` : ""}.`;
  const sent = p.email && form.get("tell") === "on"
    ? (await notify({ profileId: p.id, email: p.email }, "reward", { name: p.full_name ?? undefined, note: `You have ${what.charAt(0).toLowerCase()}${what.slice(1)}` })).email
    : null;
  revalidatePath(`/admin/clients/${profileId}`);
  const told = sent === "sent" ? " We've emailed them." : sent === "failed" ? " The email couldn't be sent." : sent ? " The email is saved in Messages (not sent in the demo)." : "";
  return { ok: true, message: `Saved: ${what}${told}` };
}

/** A code anyone can type on the Packages page (e.g. SUMMER10). Each client uses it once; optional total limit and end date. */
export async function createCode(_: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await admin("create_code");
  const code = normaliseCode(String(form.get("code") ?? ""));
  if (code.length < 3 || code.length > 24) return { ok: false, error: "Codes are 3 to 24 letters or numbers, e.g. SUMMER10." };
  const d = readDiscount(form);
  if (typeof d === "string") return { ok: false, error: d };
  const until = readDate(form, "expires_on");
  const max = String(form.get("max_uses") ?? "").trim();
  const maxUses = max ? Number(max) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)) return { ok: false, error: "Leave the limit empty, or enter a number of uses." };
  const { error } = await db().from("discount_codes").insert({
    code, kind: d.kind, value: d.value, applies_to: d.applies_to, note: String(form.get("note") ?? "").trim().slice(0, 200) || null, expires_on: until, max_uses: maxUses, created_by: viewer.profile.id,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "That code already exists. Choose another." : "Couldn't save the code." };
  revalidatePath("/admin/clients/codes");
  return { ok: true, message: `${code} is live: ${discountLabel(d.kind, d.value)} on ${targetsLabel(d.applies_to)}.` };
}

export async function setCodeActive(id: string, active: boolean) {
  if (!(await check(z.object({ id: uuid, active: z.boolean() }), { id, active })).ok) return;
  await admin("code_active", { id, active });
  const { data } = await db().from("discount_codes").update({ active }).eq("id", id).select("profile_id").maybeSingle();
  revalidatePath("/admin/clients/codes");
  if (data?.profile_id) revalidatePath(`/admin/clients/${data.profile_id}`);
}

// ── Payments (offline "Mark as paid" and memberships) ──────────────────
export async function markPaid(paymentId: string, method: "cash" | "card_in_person" | "bank_transfer" | "revolut"): Promise<ActionResult> {
  const a = await check(z.object({ paymentId: uuid, method: payMethod }), { paymentId, method });
  if (!a.ok) return a;
  await admin("mark_paid", { paymentId, method });
  let res: Awaited<ReturnType<typeof onPaymentPaid>>;
  try {
    res = await onPaymentPaid(paymentId, undefined, method);
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
  revalidatePath("/admin", "layout");
  // Once the payment is recorded it's a success, even if a follow-up (email, weekly bookings) failed (A-038).
  return { ok: true, message: res.warning ?? (res.status === "fee_paid" ? "Marked as paid (fee for a missed or late-cancelled class)." : "Marked as paid.") };
}

/**
 * Remove an unpaid request: a package request, or a trial/drop-in that was cancelled late or
 * missed and she chooses not to charge. An upcoming unpaid class is cancelled from its roster instead.
 */
export async function cancelPaymentRequest(paymentId: string): Promise<ActionResult> {
  const a = await check(z.object({ paymentId: uuid }), { paymentId });
  if (!a.ok) return a;
  await admin("cancel_payment_request", { paymentId });
  const { data: p } = await db().from("payments").select("id, booking_id, bookings!payments_booking_id_fkey(status, class_sessions(starts_at))").eq("id", paymentId).eq("status", "pending").maybeSingle();
  if (!p) return { ok: false, error: "Already settled." };
  const b = p.bookings;
  if (b?.status === "confirmed" && b.class_sessions && new Date(b.class_sessions.starts_at) > new Date()) {
    return { ok: false, error: "This class is still booked. Remove the client from the class instead." };
  }
  const { error } = await db().from("payments").update({ status: "cancelled" }).eq("id", paymentId).eq("status", "pending");
  if (error) return failed(error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** A refund she paid back by hand (a paid event the studio cancelled, or a payment that came after the spot was gone; A-031). */
export async function markRefunded(paymentId: string): Promise<ActionResult> {
  const a = await check(z.object({ paymentId: uuid }), { paymentId });
  if (!a.ok) return a;
  await admin("mark_refunded", { paymentId });
  const { data, error } = await db().from("payments").update({ status: "refunded" }).eq("id", paymentId).eq("status", "needs_refund").select("id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, error: "Already settled." };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Record an in-person renewal for an offline monthly package and grant the next period. */
export async function renewMembership(membershipId: string, method: "cash" | "card_in_person" | "bank_transfer" | "revolut"): Promise<ActionResult> {
  const a = await check(z.object({ membershipId: uuid, method: payMethod }), { membershipId, method });
  if (!a.ok) return a;
  await admin("renew_membership", { membershipId, method });
  const { data: m } = await db().from("memberships").select("*, products!memberships_product_id_fkey(*)").eq("id", membershipId).single();
  if (!m) return { ok: false, error: "Membership not found." };
  const productId = m.next_product_id ?? m.product_id;
  const { data: prod } = await db().from("products").select("*").eq("id", productId).single();
  if (!prod) return { ok: false, error: "Package not found." };
  const { data: pay, error } = await db().from("payments").insert({
    profile_id: m.profile_id, provider: "offline", amount_cents: prod.price_cents, purpose: "renewal", membership_id: m.id,
    product_id: productId, description: `${prod.name} (renewal)`, status: "pending",
  }).select("id").single();
  if (error || !pay) return failed(error);
  try {
    await onPaymentPaid(pay.id, undefined, method);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/admin/clients/${m.profile_id}`);
  return { ok: true, message: "Renewed. Next period's classes added." };
}

export async function setMembershipState(membershipId: string, action: "pause" | "resume" | "cancel" | "reactivate"): Promise<ActionResult> {
  const a = await check(z.object({ membershipId: uuid, action: z.enum(["pause", "resume", "cancel", "reactivate"]) }), { membershipId, action });
  if (!a.ok) return a;
  await admin("membership_" + action, { membershipId });
  const res = action === "pause" ? await db().rpc("pause_membership", { p_membership: membershipId })
    : action === "resume" ? await db().rpc("resume_membership", { p_membership: membershipId })
    : action === "cancel" ? await db().from("memberships").update({ cancel_at_period_end: true }).eq("id", membershipId)
    : action === "reactivate" ? await db().from("memberships").update({ cancel_at_period_end: false }).eq("id", membershipId)
    : { error: { message: "bad_action" } };
  if (res.error) return failed(res.error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function changeMembershipProduct(membershipId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("membership_change", { membershipId });
  const productId = String(form.get("product_id"));
  const { error } = await db().from("memberships").update({ next_product_id: productId }).eq("id", membershipId);
  if (error) return failed(error);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Changes from the next period." };
}

/** One tap: cancel every remaining class today, notify and refund everyone. */
export async function cancelToday(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("cancel_today");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300) || "The studio is closed today.";
  const today = todayKey();
  const { data: list } = await db().from("class_sessions").select("id").eq("status", "scheduled")
    .gt("starts_at", new Date().toISOString()).lt("starts_at", localToUtc(addDaysKey(today, 1), "00:00"));
  let people: number;
  try {
    people = await cancelSessions((list ?? []).map((s) => s.id), reason); // all or nothing (A-038)
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Cancelled ${list?.length ?? 0} classes. ${people} client${people === 1 ? "" : "s"} notified and their classes returned.` };
}

// ── Privacy: erase a client (A-059) ────────────────────────────────────
/** Right to erasure for anyone she holds (also people without a login). Type ERASE to confirm. */
export async function eraseClient(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "ERASE") return { ok: false, error: "Type ERASE to confirm." };
  const viewer = await admin("erase_client", { profileId }); // ids only, no personal data
  if (profileId === viewer.profile.id) return { ok: false, error: "You can't erase your own studio account here." };
  const { data: p } = await db().from("profiles").select("id, email, role, deleted_at").eq("id", profileId).maybeSingle();
  if (!p || p.deleted_at) return { ok: false, error: "This client's data has already been erased." };
  // V-008 (owner's answer, 7 Nov): only the instructor, who owns the studio (can_view_health), may erase another admin.
  if (p.role === "admin" && !(await canViewHealth())) return { ok: false, error: "Only the studio owner can erase a studio admin's account." };
  const { count } = await db().from("payments").select("id", { count: "exact", head: true }).eq("profile_id", profileId).in("status", ["pending", "needs_refund"]);
  if (count) return { ok: false, error: "They have a payment still to settle (awaiting payment or a refund). Settle or remove it first." };
  if (!(await eraseProfile(profileId, p.email))) return { ok: false, error: "Their data couldn't be erased. Nothing was removed. Please try again." };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Erased. Their bookings and payments stay only as anonymous records for the accounts." };
}

// ── Students & holidays ────────────────────────────────────────────────
/** Verified in person after seeing a student card. We never store card images. */
export async function setStudent(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("student_verification", { profileId });
  const until = String(form.get("student_verified_until") ?? "");
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: "Pick a valid date." };
  const { error } = await db().from("profiles").update({ student_verified_until: until || null }).eq("id", profileId);
  if (error) return failed(error);
  revalidatePath(`/admin/clients/${profileId}`);
  return { ok: true, message: until ? `Student price active until ${until}.` : "Student price removed." };
}

/** "Reschedule missed class (holiday)": gives the class back with a reason. */
// ── Closures ───────────────────────────────────────────────────────────
export async function createClosure(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("create_closure");
  const name = String(form.get("name") ?? "").trim();
  const from = String(form.get("starts_on")); const to = String(form.get("ends_on") || from);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(from) || to < from) return { ok: false, error: "Add a name and a valid date range." };
  const { data, error } = await db().from("closures").insert({ name, starts_on: from, ends_on: to }).select("id").single();
  if (error) return { ok: false, error: "That closure already exists." };
  return confirmClosure(data.id);
}

/** Confirm: cancel classes in the range (notify + return classes) and freeze packages. */
export async function confirmClosure(closureId: string): Promise<ActionResult> {
  const a = await check(z.object({ closureId: uuid }), { closureId });
  if (!a.ok) return a;
  await admin("confirm_closure", { closureId });
  const { data: c } = await db().from("closures").select("*").eq("id", closureId).single();
  if (!c) return { ok: false, error: "Not found." };
  // Cancelling the classes, crediting clients and extending packages happen in one transaction (A-038).
  const { data, error } = await db().rpc("confirm_closure", { p_closure: closureId });
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { classes: number; frozen: number; people: { session_id: string; booking_id: string; profile_id: string }[] };
  later("closure emails", () => notifyCancelled(res.people, `The studio is closed (${c.name}).`));
  revalidatePath("/admin/closures");
  return { ok: true, message: `${c.name} confirmed: ${res.classes} classes cancelled (${res.people.length} clients get their classes back), ${res.frozen} packages extended.` };
}

export async function dismissClosure(closureId: string) {
  if (!(await check(z.object({ closureId: uuid }), { closureId })).ok) return;
  await admin("dismiss_closure", { closureId });
  must(await db().from("closures").delete().eq("id", closureId).eq("confirmed", false), "dismiss closure");
  revalidatePath("/admin/closures");
}

// ── Settings ───────────────────────────────────────────────────────────
const PAYMENT_CHECKLIST = ["pay_registered_self_employed", "pay_vat_position_confirmed", "pay_bank_stripe_verified", "pay_legal_texts_reviewed", "pay_liability_insurance"];

/** Online payments can only be switched on once the studio is set up to take them (or in demo mode, test checkout only). */
export async function paymentsUnlocked() {
  if (env.demoMode) return true;
  const { data } = await db().from("compliance_items").select("key, done").in("key", PAYMENT_CHECKLIST);
  return PAYMENT_CHECKLIST.every((k) => data?.find((r) => r.key === k)?.done);
}

export async function saveSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_settings");
  const cur = await getSettings();
  const nums = parseSettingsNumbers((k) => (form.get(k) == null ? null : String(form.get(k))), {
    cancellation_cutoff_hours: cur.cancellation_cutoff_hours, waitlist_window_hours: cur.waitlist_window_minutes / 60, waitlist_close_minutes: cur.waitlist_close_minutes,
    hold_minutes: cur.hold_minutes, rollover_max: cur.rollover_max, unpaid_request_expiry_hours: cur.unpaid_request_expiry_hours,
    expiry_reminder_days: cur.expiry_reminder_days, student_discount_pct: cur.student_discount_pct, booking_window_weeks: Math.round(cur.booking_window_days / 7),
  });
  if (!nums.ok) return { ok: false, error: `Please check: ${Object.values(nums.errors).join("; ")}.` };
  const num = (k: keyof typeof nums.values) => nums.values[k];
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const revolut = String(form.get("revolut_link") ?? "").trim();
  if (revolut && !/^https:\/\/[^\s"'<>]+$/.test(revolut)) return { ok: false, error: "The Revolut link must start with https://" };
  const wantOnline = form.get("online_payments_enabled") === "on";
  if (wantOnline && !(await paymentsUnlocked())) {
    return { ok: false, error: "Online payments stay off until every item under “Before online payments” is ticked in Compliance." };
  }
  // Without card payment keys only the demo's test checkout exists; it must never grant classes for free (A-040).
  if (wantOnline && !paymentsLive() && !env.demoMode) {
    return { ok: false, error: "Online payments need the card payment account connected first. Ask your developer." };
  }
  const offsets = str("reminder_offsets").split(",").map((s) => Math.round(Number(s.trim()) * 60)).filter((n) => n > 0 && n <= 10080);
  const { error } = await db().from("studio_settings").update({
    cancellation_cutoff_hours: num("cancellation_cutoff_hours"),
    waitlist_window_minutes: Math.round(num("waitlist_window_hours") * 60),
    waitlist_close_minutes: num("waitlist_close_minutes"),
    waitlist_sms: form.get("waitlist_sms") === "on",
    alert_bookings: form.get("alert_bookings") === "on",
    alert_signups: form.get("alert_signups") === "on",
    alert_cancellations: form.get("alert_cancellations") === "on",
    alert_requests: form.get("alert_requests") === "on",
    alert_details: form.get("alert_details") === "on",
    alert_email: (() => { const e = String(form.get("alert_email") ?? "").trim(); return e && z.string().email().safeParse(e).success ? e : null; })(),
    hold_minutes: num("hold_minutes"),
    reminder_offsets_minutes: offsets.length ? offsets : [1440, 120],
    refund_late_cancel_if_filled: form.get("refund_late_cancel_if_filled") === "on",
    online_payments_enabled: wantOnline,
    allow_pay_later: form.get("allow_pay_later") === "on",
    membership_period_mode: str("membership_period_mode") === "calendar" ? "calendar" : "rolling",
    rollover_max: num("rollover_max"),
    status_banner: str("status_banner").slice(0, 200),
    unpaid_request_expiry_hours: num("unpaid_request_expiry_hours"),
    expiry_reminder_days: num("expiry_reminder_days"),
    student_discount_pct: num("student_discount_pct"),
    revolut_link: str("revolut_link"), bank_account_name: str("bank_account_name"), bank_iban: str("bank_iban").replace(/\s+/g, " "),
    legal_name: str("legal_name"), trader_name: str("trader_name"), address: str("address"),
    contact_email: str("contact_email"), contact_phone: str("contact_phone"), instagram_handle: str("instagram_handle").replace(/^@/, ""),
    booking_window_days: num("booking_window_weeks") * 7, // 1 week to 6 months
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  if (error) return { ok: false, error: "Some values are out of range. Please check them." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

// ── Class types, packages and single classes (she builds them herself) ──
const months = monthsLabel;
const priceCents = (v: FormDataEntryValue | null) => {
  const c = Math.round(Number(String(v ?? "").replace(",", ".").trim()) * 100);
  return Number.isFinite(c) && c >= 0 && c <= 1_000_000 && String(v ?? "").trim() !== "" ? c : null;
};
const ClassTypeInput = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(60),
  default_capacity: z.coerce.number().int().min(1, "Spots: 1 to 100.").max(100, "Spots: 1 to 100."),
  default_duration_minutes: z.coerce.number().int().min(10, "Minutes: 10 to 600.").max(600, "Minutes: 10 to 600."),
  credit_cost: z.coerce.number().int().min(1, "Classes used: 1 to 10.").max(10, "Classes used: 1 to 10."),
  default_location: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
});
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);

/** A class type with its own packages (e.g. "Pre and post natal"): creates what packages can be "for", then the type. */
async function newOwnClassType(input: z.infer<typeof ClassTypeInput>, active = true) {
  const { data: key, error } = await db().rpc("add_credit_kind", { p_label: input.name });
  if (error || !key) return { error: "Couldn't create the class type." } as const;
  const { error: e2 } = await db().from("class_types").insert({
    ...input, default_location: input.default_location || null, description: input.description || null,
    kind: "other", credit_kind: key as string, slug: slugOf(input.name), price_cents: 0, active,
    sort_order: 100,
  });
  if (e2) return { error: "Couldn't save the class type." } as const;
  return { key: key as string, label: input.name } as const;
}

/** "+ New class type" inside the package / single class form: saved straight away, then chosen in "For". */
export async function createClassType(raw: Record<string, string>): Promise<ActionResult<{ key: string; label: string }>> {
  await admin("create_class_type", { name: raw?.name });
  const p = ClassTypeInput.safeParse(raw ?? {});
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const res = await newOwnClassType(p.data);
  if ("error" in res) return { ok: false, error: res.error! };
  revalidatePath("/admin/settings");
  return { ok: true, data: res, message: `${res.label} added. It's under Class types too.` };
}

/**
 * A class type is what appears on the schedule and in the timetable, and says which packages pay for it
 * (Reformer, Mat, another type's, or its own). No price: prices come from packages, trials and drop-ins.
 * Events have no capacity, length, price or credits here: each event sets its own.
 */
export async function saveClassType(id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_class_type", { id });
  const { data: cur } = id ? await db().from("class_types").select("kind, credit_kind").eq("id", id).maybeSingle() : { data: null };
  const isEvent = cur?.kind === "event";
  const active = form.get("active") === "on";
  if (isEvent) {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Give it a name." };
    const { error } = await db().from("class_types").update({
      name, active, description: String(form.get("description") ?? "").trim() || null,
      default_location: String(form.get("default_location") ?? "").trim() || null,
    }).eq("id", id!);
    if (error) return failed(error);
    revalidatePath("/admin/settings");
    return { ok: true, message: "Saved." };
  }
  const p = ClassTypeInput.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const paidWith = String(form.get("paid_with") ?? "");
  if (!id && paidWith === "own") {
    const res = await newOwnClassType(p.data, active);
    if ("error" in res) return { ok: false, error: res.error! };
    revalidatePath("/admin/settings");
    return { ok: true, message: `${res.label} added, with its own packages. Add them under Packages.` };
  }
  const kinds = await getKinds();
  if (!kinds.some((k) => k.key === paidWith)) return { ok: false, error: "Choose which packages pay for it." };
  const classKind: "reformer" | "mat" | "other" = paidWith === "reformer" ? "reformer" : paidWith === "mat" ? "mat" : "other";
  const row = {
    ...p.data, default_location: p.data.default_location || null, description: p.data.description || null, active,
    private: form.get("private") === "on",
    credit_kind: paidWith,
    // Reformer and Mat keep their own wording ("2 reformers left"); anything else reads "spots".
    kind: classKind,
  };
  const { error } = id
    ? await db().from("class_types").update(row).eq("id", id)
    : await db().from("class_types").insert({ ...row, slug: slugOf(p.data.name), price_cents: 0, sort_order: 100 });
  if (error) return { ok: false, error: "Couldn't save. Check the spots (1–100) and minutes." };
  // A type with its own packages: renaming it renames what its packages are "for".
  if (id && cur?.credit_kind && cur.credit_kind === paidWith && !["reformer", "mat"].includes(paidWith)) {
    const { count } = await db().from("class_types").select("id", { count: "exact", head: true }).eq("credit_kind", paidWith).neq("id", id).is("archived_at", null);
    if (!count) await db().from("credit_kinds").update({ label: p.data.name }).eq("key", paidWith);
  }
  revalidatePath("/admin/settings");
  revalidatePath("/schedule");
  return { ok: true, message: "Saved." };
}

/** Delete a class type. Used before → kept for past classes but removed from every list; never with classes still to come. */
export async function deleteClassType(id: string): Promise<ActionResult> {
  await admin("delete_class_type", { id });
  const { data: ct } = await db().from("class_types").select("kind, credit_kind, name").eq("id", id).maybeSingle();
  if (!ct) return { ok: false, error: "Not found." };
  if (ct.kind === "event") return { ok: false, error: "Events can't be deleted: turn them off instead (untick Active)." };
  const { count: upcoming } = await db().from("class_sessions").select("id", { count: "exact", head: true })
    .eq("class_type_id", id).eq("status", "scheduled").gt("starts_at", new Date().toISOString());
  if (upcoming) return { ok: false, error: `${ct.name} has ${upcoming} class${upcoming === 1 ? "" : "es"} coming up. Cancel or change them in Classes first, then delete it.` };
  // Stop it repeating: out of the timetable and clients' weekly picks.
  for (const res of [await db().from("template_slots").delete().eq("class_type_id", id), await db().from("recurring_rules").delete().eq("class_type_id", id)]) {
    if (res.error) return failed(res.error);
  }
  const { count: used } = await db().from("class_sessions").select("id", { count: "exact", head: true }).eq("class_type_id", id);
  if (used) await db().from("class_types").update({ archived_at: new Date().toISOString(), active: false }).eq("id", id);
  else await db().from("class_types").delete().eq("id", id);
  // Its own packages' "For" entry goes too, once nothing else uses it (no other type, package or client package).
  if (ct.credit_kind && ct.credit_kind !== "reformer" && ct.credit_kind !== "mat") {
    const [{ count: types }, { count: offers }, { count: lots }] = await Promise.all([
      db().from("class_types").select("id", { count: "exact", head: true }).eq("credit_kind", ct.credit_kind).is("archived_at", null),
      db().from("products").select("id", { count: "exact", head: true }).eq("credit_kind", ct.credit_kind).is("archived_at", null),
      db().from("credit_lots").select("id", { count: "exact", head: true }).eq("credit_kind", ct.credit_kind),
    ]);
    if (!types && !offers && !lots) {
      const { data: k } = await db().from("credit_kinds").delete().eq("key", ct.credit_kind).select("tab").maybeSingle();
      // Its tab goes too once it holds nothing else.
      if (k?.tab) {
        const { count: left } = await db().from("credit_kinds").select("key", { count: "exact", head: true }).eq("tab", k.tab);
        if (!left) await db().from("package_tabs").delete().eq("key", k.tab);
      }
    }
  }
  revalidatePath("/admin/settings");
  revalidatePath("/schedule");
  return { ok: true, message: used ? `${ct.name} is deleted. Past classes still show it in clients' history.` : `${ct.name} is deleted.` };
}

/**
 * A tab on the clients' Packages page (Mat, Reformer, Pre and Post Natal, Private…): its name, a note shown at the
 * top, whether clients can see it, and for each class type in it, its heading, description and which tab it's in.
 */
export async function saveTab(key: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_tab", { key });
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, error: "Give the tab a name." };
  const sort = Number(form.get("sort"));
  const { error } = await db().from("package_tabs").update({
    label, note: String(form.get("note") ?? "").trim().slice(0, 600) || null, visible: form.get("visible") === "on",
    ...(Number.isInteger(sort) && sort >= 0 && sort < 1000 ? { sort } : {}),
  }).eq("key", key);
  if (error) return { ok: false, error: "Couldn't save the tab." };
  const tabs = new Set(((await db().from("package_tabs").select("key")).data ?? []).map((t) => t.key));
  for (const k of form.getAll("kinds").map(String)) {
    const tab = String(form.get(`tab_${k}`) ?? key);
    const { error: e } = await db().from("credit_kinds").update({
      sub_label: String(form.get(`sub_${k}`) ?? "").trim().slice(0, 60) || null,
      description: String(form.get(`desc_${k}`) ?? "").trim().slice(0, 600) || null,
      ...(tabs.has(tab) ? { tab } : {}),
    }).eq("key", k);
    if (e) return failed(e);
  }
  revalidatePath("/admin/settings");
  revalidatePath("/packs");
  return { ok: true, message: form.get("visible") === "on" ? "Saved. Clients can see this tab." : "Saved. This tab is hidden from clients." };
}

/** A package's or single class's details and price. */
export async function saveProduct(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_product", { id });
  const cents = priceCents(form.get("price"));
  if (cents == null) return { ok: false, error: "Please check the price (numbers only, e.g. 130)." };
  const { data: cur } = await db().from("products").select("tag, credit_kind").eq("id", id).single();
  const credits = Number(form.get("credits"));
  const m = Number(form.get("months")) || null;
  if (cur?.tag === "package" && (!Number.isInteger(credits) || credits < 1 || credits > 200 || !m || m > 12)) return { ok: false, error: "Please check the classes and months." };
  // A-036: more than 366 days can't be granted (credit_lots_validity_days_check), so Mark as paid would fail.
  const validDays = Number(form.get("validity_days")) || null;
  if (cur?.tag === "package" && validDays != null && (!Number.isInteger(validDays) || validDays < 1 || validDays > 366)) return { ok: false, error: "Days valid must be between 1 and 366." };
  const name = String(form.get("name") ?? "").trim();
  if (cur?.tag !== "package" && !name) return { ok: false, error: "Give it a name." };
  const { error } = await db().from("products").update({
    price_cents: cents,
    description: String(form.get("description") ?? "").trim() || null,
    active: form.get("active") === "on",
    ...(cur?.tag === "package" ? {
      credits, months: m, validity_days: validDays,
      per_week: m ? Math.max(1, Math.min(7, Math.round(credits / (4 * m)))) : null,
      // The name follows the details: "Reformer · 8 classes · 1 month".
      name: `${await kindLabel(cur.credit_kind)} · ${credits} classes · ${months(m!)}`,
    } : { name }),
  }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/admin/settings");
  revalidatePath("/packs");
  return { ok: true, message: "Saved. Clients see it straight away." };
}

/** A new package, or a single class (trial or drop-in) with her own name, for any class type. */
export async function addProduct(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("add_product");
  const type = form.get("type") === "single" ? "single" : "package";
  const creditKind = String(form.get("credit_kind") ?? "");
  if (!(await getKinds()).some((k) => k.key === creditKind)) return { ok: false, error: "Choose what it's for, or add a new class type." };
  const cents = priceCents(form.get("price"));
  if (cents == null) return { ok: false, error: "Please check the price (numbers only, e.g. 25)." };
  const description = String(form.get("description") ?? "").trim().slice(0, 300) || null;
  const { data: last } = await db().from("products").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? 0) + 1;
  const active = form.get("active") !== "off";
  let error;
  if (type === "single") {
    const tag = form.get("tag") === "trial" ? "trial" : "drop_in";
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    if (!name) return { ok: false, error: "Give it a name, e.g. Pre and Post Natal Reformer Trial." };
    ({ error } = await db().from("products").insert({
      kind: "single", tag, credit_kind: creditKind, credits: 1, price_cents: cents, name, description, is_group: tag === "trial", active, sort_order,
    }));
  } else {
    const credits = Number(form.get("credits")), m = Number(form.get("months")), valid = Number(form.get("validity_days"));
    if (!Number.isInteger(credits) || credits < 1 || credits > 200 || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(valid) || valid < 1 || valid > 366)
      return { ok: false, error: "Please check the classes, months and days valid." };
    ({ error } = await db().from("products").insert({
      kind: "pack", tag: "package", credit_kind: creditKind, credits, months: m, validity_days: valid, is_group: true, active, description,
      per_week: Math.max(1, Math.min(7, Math.round(credits / (4 * m)))), price_cents: cents,
      name: `${await kindLabel(creditKind)} · ${credits} classes · ${months(m)}`, sort_order,
    }));
  }
  if (error) return { ok: false, error: "Couldn't add it. Please try again." };
  revalidatePath("/admin/settings");
  revalidatePath("/packs");
  return { ok: true, message: `${type === "single" ? "Single class" : "Package"} added. ${active ? "Clients see it on the Packages page." : "It's not on sale yet."}` };
}

/** Delete a package or single class. Already bought → kept on receipts and history, removed from every list. */
export async function deleteProduct(id: string): Promise<ActionResult> {
  await admin("delete_product", { id });
  const [{ count: paid }, { count: members }] = await Promise.all([
    db().from("payments").select("id", { count: "exact", head: true }).eq("product_id", id),
    db().from("memberships").select("id", { count: "exact", head: true }).or(`product_id.eq.${id},next_product_id.eq.${id}`),
  ]);
  const { error } = paid || members
    ? await db().from("products").update({ archived_at: new Date().toISOString(), active: false }).eq("id", id)
    : await db().from("products").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete it." };
  revalidatePath("/admin/settings");
  revalidatePath("/packs");
  return { ok: true, message: paid ? "Deleted. Past receipts still show it." : "Deleted." };
}

export async function toggleCompliance(key: string, done: boolean) {
  await admin("compliance", { key, done });
  must(await db().from("compliance_items").update({ done, updated_at: new Date().toISOString() }).eq("key", key), "compliance");
  revalidatePath("/admin/compliance");
}

/** Send a test email to the signed-in admin and say what happened. */
export async function sendTestEmail(): Promise<ActionResult> {
  const viewer = await admin("test_email");
  const r = await notify({ profileId: viewer.profile.id, email: viewer.email }, "test_email", {});
  revalidatePath("/admin/outbox");
  if (r.email === "sent") return { ok: true, message: `Sent to ${viewer.email}. Check your inbox (and spam, just in case).` };
  if (r.email === "logged") return { ok: true, message: "Email isn't live here (demo mode or no email key), so it was only logged below." };
  return { ok: false, error: "Sending failed. The details are in the message below; usually the domain isn't verified in Resend yet." };
}

/** Outbox "Send again": resend one failed email or text now (A-015). */
export async function resendNotification(id: string): Promise<ActionResult> {
  await admin("resend_notification", { id });
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "That message can't be found." };
  const r = await retryFailed({ id });
  revalidatePath("/admin/outbox");
  if (r.sent) return { ok: true, message: "Sent." };
  return { ok: false, error: env.demoMode || !emailLive() ? "Email isn't live here, so it can't be sent." : "It failed again. The details are on the message; it'll be tried again automatically." };
}

export async function runTickNow(): Promise<ActionResult> {
  await admin("run_tick");
  const r = await runTick("admin");
  revalidatePath("/admin/outbox");
  const done = `${r.reminders} reminders, ${r.offers} waitlist offers, ${r.retried} resent.`;
  if (r.errors.length) return { ok: false, error: `Partly done (${done}) Some steps failed: ${r.errors.join(", ")}. Let your developer know.` };
  return { ok: true, message: `Done: ${done}` };
}

// ── Import ─────────────────────────────────────────────────────────────
const ImportClient = z.object({
  full_name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")).transform((v) => v || null),
  phone: z.string().trim().optional().transform((v) => v || null),
  notes: z.string().trim().optional().transform((v) => v || null),
  reformer_credits: z.coerce.number().int().min(0).max(100).optional().default(0),
  mat_credits: z.coerce.number().int().min(0).max(100).optional().default(0),
  credits_expire: z.string().trim().optional(),
});

export async function importClients(rows: Record<string, unknown>[], adults = false): Promise<ActionResult<{ created: number; updated: number; skipped: number; badDates: number }>> {
  await admin("import_clients", { count: rows.length });
  // A-062: classes are for adults; the file has no dates of birth, so she confirms it for everyone in it.
  if (adults !== true) return { ok: false, error: "Please confirm everyone in the file is 18 or over: classes are for adults." };
  let created = 0, updated = 0, skipped = 0, failedGrants = 0, badDates = 0;
  const valid: z.infer<typeof ImportClient>[] = [];
  for (const raw of rows.slice(0, 2000)) {
    const r = ImportClient.safeParse(raw);
    // A-048: the end date must be a real date (ISO, DD.MM.YYYY or DD/MM/YYYY); otherwise the row is skipped, never "never expires".
    if (r.success && r.data.credits_expire && !importDateKey(r.data.credits_expire)) { badDates++; skipped++; continue; }
    if (r.success) valid.push(r.data); else skipped++;
  }
  // Existing clients looked up in chunks, not one query per row (A-049), so a big file fits in the time limit.
  const emails = [...new Set(valid.map((c) => c.email).filter((e): e is string => !!e))];
  const known = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await db().from("profiles").select("id, email").in("email", emails.slice(i, i + 200)).is("deleted_at", null);
    for (const p of data ?? []) if (p.email) known.set(p.email, p.id);
  }
  // Rows for the same email stay in file order (later rows update the first); different people run 5 at a time.
  const groups = new Map<string, z.infer<typeof ImportClient>[]>();
  valid.forEach((c, n) => { const k = c.email ?? `#${n}`; groups.set(k, [...(groups.get(k) ?? []), c]); });
  await pool([...groups.values()], 5, async (group) => {
    for (const c of group) {
      let id = c.email ? known.get(c.email) : undefined;
      if (id) {
        const { error } = await db().from("profiles").update({ full_name: c.full_name, phone: c.phone ?? undefined, admin_notes: c.notes ?? undefined }).eq("id", id);
        if (error) { console.error("import update failed", error); skipped++; continue; }
        updated++;
      } else {
        const { data } = await db().from("profiles").insert({ full_name: c.full_name, email: c.email, phone: c.phone, admin_notes: c.notes }).select("id").single();
        id = data?.id;
        if (!id) { skipped++; continue; } // A-054: not counted as created when it wasn't
        created++;
        if (id && c.email) known.set(c.email, id);
      }
      if (!id) continue;
      // The last day is included: classes expire at the start of the next studio day.
      const lastDayKey = c.credits_expire ? importDateKey(c.credits_expire) : null;
      const expires = lastDayKey ? localToUtc(addDaysKey(lastDayKey, 1), "00:00") : null;
      for (const [kind, n] of [["reformer", c.reformer_credits], ["mat", c.mat_credits]] as const) {
        if (!n) continue;
        const { error } = await db().rpc("grant_lot", { p_profile: id, p_kind: kind, p_credits: n, p_expires: expires as string /* null = never expires */, p_note: "Imported balance" });
        if (error) { console.error("import grant failed", error); failedGrants++; }
      }
    }
  });
  revalidatePath("/admin/clients");
  if (failedGrants) return { ok: false, error: `${created} added and ${updated} updated, but ${failedGrants} class balance${failedGrants === 1 ? "" : "s"} couldn't be added. Check those clients' packages.` };
  return { ok: true, data: { created, updated, skipped, badDates } };
}

const DAY: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

export async function importTimetable(rows: Record<string, unknown>[], name: string, from: string, to: string): Promise<ActionResult> {
  await admin("import_timetable", { count: rows.length });
  const { data: types } = await db().from("class_types").select("id, slug, name, kind");
  const slots = [];
  for (const r of rows) {
    const day = DAY[String(r.day ?? r.weekday ?? "").trim().slice(0, 3).toLowerCase()] ?? Number(r.day ?? r.weekday);
    const time = String(r.time ?? "").trim().replace(".", ":").padStart(5, "0");
    const typeName = String(r.class_type ?? r.type ?? "reformer").trim().toLowerCase();
    const type = types?.find((t) => t.slug === typeName || t.name.toLowerCase() === typeName || t.kind === typeName);
    if (!day || day < 1 || day > 7 || !/^\d{2}:\d{2}$/.test(time) || !type) continue;
    slots.push({ weekday: day, time, class_type_id: type.id, capacity: Number.isInteger(Number(r.capacity)) && Number(r.capacity) >= 1 && Number(r.capacity) <= 100 ? Number(r.capacity) : null });
  }
  const fd = new FormData();
  fd.set("name", name); fd.set("valid_from", from); fd.set("valid_to", to); fd.set("slots", JSON.stringify(slots));
  return saveTimetable({ ok: true }, fd);
}

// ── Demo ───────────────────────────────────────────────────────────────
export async function resetDemoData(): Promise<ActionResult> {
  if (!env.demoMode) return { ok: false, error: "Reset is only available in demo mode." };
  await admin("reset_demo_data");
  const { error } = await db().rpc("reset_demo_data");
  if (error) return { ok: false, error: "Reset failed. Check the server logs." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data reset. Fresh classes, clients and bookings are ready." };
}

// ── Her texts & team ───────────────────────────────────────────────────
const TEXT_KEYS = ["studio_rules", "payments_policy", "what_to_bring", "magic_text", "studio_text", "events_intro"] as const;
const OPTIONAL_TEXTS: readonly string[] = ["studio_text", "events_intro"]; // empty hides them; the others fall back to the defaults

export async function saveTexts(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_texts");
  const rows = TEXT_KEYS.map((key) => ({ key, value: String(form.get(key) ?? "").trim().slice(0, 6000), updated_at: new Date().toISOString() }))
    .filter((r) => r.value || OPTIONAL_TEXTS.includes(r.key));
  const { error } = await db().from("site_content").upsert(rows);
  if (error) return { ok: false, error: "Couldn't save the texts." };
  // The Terms: kept only when she changed them; empty (or our default) goes back to the default, which follows her settings.
  const terms = String(form.get("terms") ?? "").replace(/\r/g, "").trim().slice(0, 20000);
  if (!terms || terms === defaultTerms(await getSettings()).trim()) await db().from("site_content").delete().eq("key", "terms");
  else await db().from("site_content").upsert({ key: "terms", value: terms, updated_at: new Date().toISOString() });
  const intro = String(form.get("intro_line") ?? "").trim();
  if (intro) await db().from("studio_settings").update({ intro_line: intro.slice(0, 300) }).eq("id", 1);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Your changes are live." };
}

/**
 * Add someone to the studio team (admin access). They sign in with this email. Someone who already has
 * a login gets access straight away; otherwise it's an invite (team_invites), granted only when they
 * first sign in with a code sent to that email, so nobody can claim it by creating that login elsewhere.
 */
export async function addTeamMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await admin("team_add");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Enter a valid email." };
  const { data: existing } = await db().from("profiles").select("id, user_id").eq("email", email).is("deleted_at", null).maybeSingle();
  const { error } = existing?.user_id
    ? await db().from("profiles").update({ role: "admin" }).eq("id", existing.id)
    : await db().from("team_invites").upsert({ email, full_name: String(form.get("name") ?? "").trim() || null, invited_by: viewer.profile.id });
  if (error) return { ok: false, error: "Couldn't add them. Please try again." };
  revalidatePath("/admin/team");
  return { ok: true, message: `${email} can now sign in to the studio admin.` };
}

/** Withdraw a Studio-team invite that hasn't been used yet. */
export async function removeTeamInvite(email: string): Promise<ActionResult> {
  await admin("team_invite_remove", { email });
  const { error } = await db().from("team_invites").delete().eq("email", String(email).trim().toLowerCase());
  if (error) return failed(error);
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function removeTeamMember(profileId: string): Promise<ActionResult> {
  const viewer = await admin("team_remove", { profileId });
  if (profileId === viewer.profile.id) return { ok: false, error: "You can't remove yourself." };
  const { error } = await db().from("profiles").update({ role: "client" }).eq("id", profileId);
  if (error) return failed(error);
  revalidatePath("/admin/team");
  return { ok: true };
}
