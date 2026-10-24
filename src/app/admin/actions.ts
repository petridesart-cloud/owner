"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { cancelBooking, cancelSession, notifyOffers, onPaymentPaid, policyLine, runTick, sessionInfo } from "@/lib/booking";
import { notify } from "@/lib/notifications";
import { applyRecurring } from "@/lib/recurring";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { addDaysKey, localToUtc, spokenDateTime, todayKey } from "@/lib/time";
import type { Json } from "@/lib/supabase/types";

async function admin(action: string, details?: Record<string, unknown>) {
  const viewer = await requireAdmin();
  await db().from("audit_log").insert({ actor_profile_id: viewer.profile.id, action, details: (details ?? null) as Json });
  return viewer;
}

// ── Check-in & roster ──────────────────────────────────────────────────
export async function toggleCheckIn(bookingId: string, checked: boolean) {
  await admin("check_in", { bookingId, checked });
  await db().from("bookings").update({ checked_in_at: checked ? new Date().toISOString() : null }).eq("id", bookingId);
  revalidatePath("/admin");
}

export async function markNoShow(bookingId: string) {
  await admin("no_show", { bookingId });
  await db().from("bookings").update({ status: "no_show", checked_in_at: null }).eq("id", bookingId).eq("status", "confirmed");
  revalidatePath("/admin");
}

export async function adminCancelBooking(bookingId: string, sessionId: string): Promise<ActionResult> {
  const viewer = await admin("cancel_booking", { bookingId });
  const res = await cancelBooking(viewer.profile, bookingId, true);
  revalidatePath(`/admin/classes/${sessionId}`);
  return res.ok ? { ok: true } : res;
}

const NewClient = z.object({
  full_name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.string().trim().optional(),
});

export async function manualBook(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("manual_book", { sessionId });
  let profileId = String(form.get("profile_id") ?? "");
  if (!profileId) {
    const parsed = NewClient.safeParse({ full_name: form.get("full_name"), email: form.get("email") ?? "", phone: form.get("phone") ?? "" });
    if (!parsed.success) return { ok: false, error: "Pick a client or enter at least a name." };
    const email = parsed.data.email || null;
    const existing = email ? (await db().from("profiles").select("id").ilike("email", email).is("deleted_at", null).maybeSingle()).data : null;
    if (existing) profileId = existing.id;
    else {
      const { data, error } = await db().from("profiles").insert({ full_name: parsed.data.full_name, email, phone: parsed.data.phone || null }).select("id").single();
      if (error) return { ok: false, error: "Couldn't create the client." };
      profileId = data.id;
    }
  }
  const mode = form.get("mode") === "credit" ? "credit" : "manual";
  const { data, error } = await db().rpc("book_session", { p_profile: profileId, p_session: sessionId, p_mode: mode, p_source: "manual" });
  if (error) return { ok: false, error: friendlyError(error) };
  if (form.get("notify") === "on") {
    const [{ data: p }, s] = await Promise.all([db().from("profiles").select("*").eq("id", profileId).single(), sessionInfo(sessionId)]);
    if (p) await notify({ profileId: p.id, email: p.email, phone: p.phone }, "booking_confirmed",
      { name: p.full_name ?? undefined, className: s.name, when: spokenDateTime(s.starts_at), location: s.where, policy: policyLine(s.cancelBy, s.cutoff) },
      { bookingId: (data as { booking_id: string }).booking_id, sessionId });
  }
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: "Added to class." };
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
});

function sessionRow(form: FormData) {
  const p = SessionForm.safeParse(Object.fromEntries(form));
  if (!p.success) return null;
  const starts = localToUtc(p.data.date, p.data.time);
  return {
    class_type_id: p.data.class_type_id,
    starts_at: starts,
    ends_at: new Date(new Date(starts).getTime() + p.data.duration * 60_000).toISOString(),
    capacity: p.data.capacity,
    price_cents: p.data.price ? Math.round(Number(p.data.price.replace(",", ".")) * 100) : null,
    title: p.data.title || null,
    location: p.data.location || null,
    description: p.data.description || null,
    clients_only: form.get("clients_only") === "on",
    what_to_bring: p.data.what_to_bring || null,
    event_policy: p.data.event_policy || null,
    recap: p.data.recap || null,
  };
}

export async function createSession(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("create_session");
  const row = sessionRow(form);
  if (!row) return { ok: false, error: "Please check the date, time, duration and capacity." };
  const { data, error } = await db().from("class_sessions").insert(row).select("id").single();
  if (error) return { ok: false, error: error.code === "23505" ? "A class of that type already exists at that time." : "Couldn't create the class." };
  redirect(`/admin/classes/${data.id}`);
}

export async function updateSession(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("update_session", { sessionId });
  const row = sessionRow(form);
  if (!row) return { ok: false, error: "Please check the fields." };
  const { count } = await db().from("bookings").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("status", "confirmed");
  if ((count ?? 0) > row.capacity) return { ok: false, error: `${count} people are booked, so capacity can't go below that.` };
  const { error } = await db().from("class_sessions").update(row).eq("id", sessionId);
  if (error) return { ok: false, error: "Couldn't save changes." };
  // More capacity may free spots for the waitlist.
  const { data: offers } = await db().rpc("process_waitlist", { p_session: sessionId });
  await notifyOffers((offers ?? []) as { entry_id: string; profile_id: string; offer_expires_at: string }[]);
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: "Saved." };
}

export async function cancelSessionAction(sessionId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("cancel_session", { sessionId });
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  const n = await cancelSession(sessionId, reason);
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: `Class cancelled. ${n} client${n === 1 ? "" : "s"} notified and credited.` };
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
  await admin("event_access_remove", { sessionId, profileId });
  await db().from("event_access").delete().eq("session_id", sessionId).eq("profile_id", profileId);
  revalidatePath(`/admin/classes/${sessionId}`);
  return { ok: true, message: "Removed." };
}

// ── Timetable ──────────────────────────────────────────────────────────
const Slot = z.object({ weekday: z.number().int().min(1).max(7), time: z.string().regex(/^\d{2}:\d{2}$/), class_type_id: z.string().uuid(), capacity: z.number().int().min(1).max(100).nullable().optional() });

export async function saveTimetable(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_timetable");
  const from = String(form.get("valid_from"));
  const slots = z.array(Slot).safeParse(JSON.parse(String(form.get("slots") ?? "[]")));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false, error: "Pick the date it starts." };
  if (!slots.success || slots.data.length === 0) return { ok: false, error: "Add at least one class time." };
  const name = String(form.get("name") ?? "").trim() || `Timetable from ${from}`;
  // It repeats every week from the start date; each tick tops it up to ~9 weeks ahead (extend_timetable).
  const { data: t, error } = await db().from("timetable_templates").insert({ name, valid_from: from, valid_to: addDaysKey(from, 62), repeats: true }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the timetable." };
  const unique = new Map(slots.data.map((s) => [`${s.weekday}-${s.time}`, s]));
  await db().from("template_slots").insert([...unique.values()].map((s) => ({ template_id: t.id, weekday: s.weekday, start_time: s.time, class_type_id: s.class_type_id, capacity: s.capacity ?? null })));
  const { data: kept } = await db().rpc("replace_timetable_from", { p_template: t.id });
  await db().rpc("generate_sessions", { p_template: t.id });
  await db().rpc("extend_timetable", {});
  await applyRecurring();
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/classes");
  return { ok: true, message: `Saved. Your classes now repeat every week from ${from}.${kept ? ` ${kept} class${kept === 1 ? "" : "es"} from the old timetable already ${kept === 1 ? "has" : "have"} bookings and ${kept === 1 ? "was" : "were"} kept: check them in Classes.` : ""}` };
}

// ── Clients ────────────────────────────────────────────────────────────
/** She has seen the doctor's written clearance (pregnancy / recent surgery). */
export async function clearanceReceived(profileId: string): Promise<ActionResult> {
  await admin("clearance_received", { profileId });
  await db().from("health_notes").update({ clearance_received_at: todayKey() }).eq("profile_id", profileId);
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

const LOT_ERRORS: Record<string, string> = {
  reason_required: "Please add a reason (it's kept in the client's history).",
  bad_days: "Enter a number of days between 1 and 365.",
  bad_date: "Pick a date from today on.",
  no_end_date: "These classes have no end date, so there is nothing to extend.",
  booked_after: "They're booked into classes after that date with this package. Cancel those first.",
  bad_credits: "Enter between 1 and 50 classes.",
  not_enough_credits: "They don't have that many classes left in this package.",
};

/** Extend, freeze, end earlier, add or remove classes on one package. */
export async function adjustLot(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await admin("adjust_lot", { profileId, action: form.get("action"), lot: form.get("lot") });
  const action = String(form.get("action") ?? "");
  const lot = String(form.get("lot") ?? "");
  const n = Number(form.get("amount") || 0);
  const date = String(form.get("date") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!["extend", "freeze", "end", "add", "remove"].includes(action) || !/^[0-9a-f-]{36}$/.test(lot)) return { ok: false, error: "Choose a package and what to change." };
  const { data: owned } = await db().from("credit_lots").select("id").eq("id", lot).eq("profile_id", profileId).maybeSingle();
  if (!owned) return { ok: false, error: "Choose one of this client's packages." };
  const { error } = await db().rpc("admin_adjust_lot", {
    p_lot: lot, p_action: action, p_days: action === "extend" || action === "freeze" ? n : 0, p_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (null as unknown as string),
    p_credits: action === "add" || action === "remove" ? n : 0, p_reason: reason, p_actor: viewer.profile.id,
  });
  if (error) return { ok: false, error: LOT_ERRORS[error.message] ?? "Couldn't change the package." };
  revalidatePath(`/admin/clients/${profileId}`);
  const done: Record<string, string> = {
    extend: `Extended by ${n} day${n === 1 ? "" : "s"}.`, freeze: `Frozen for ${n} day${n === 1 ? "" : "s"}: the end date moved by the same.`,
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
  const kind = form.get("kind") === "mat" ? "mat" : "reformer";
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
  return { ok: true, message: `Gave ${amount} ${kind} class${amount === 1 ? "" : "es"}, usable until ${until.split("-").reverse().join(".")}.` };
}

// ── Payments (offline "Mark as paid" and memberships) ──────────────────
export async function markPaid(paymentId: string, method: "cash" | "card_in_person" | "bank_transfer" | "revolut"): Promise<ActionResult> {
  await admin("mark_paid", { paymentId, method });
  try {
    await onPaymentPaid(paymentId, undefined, method);
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Marked as paid." };
}

/**
 * Remove an unpaid request: a package request, or a trial/drop-in that was cancelled late or
 * missed and she chooses not to charge. An upcoming unpaid class is cancelled from its roster instead.
 */
export async function cancelPaymentRequest(paymentId: string): Promise<ActionResult> {
  await admin("cancel_payment_request", { paymentId });
  const { data: p } = await db().from("payments").select("id, booking_id, bookings!payments_booking_id_fkey(status, class_sessions(starts_at))").eq("id", paymentId).eq("status", "pending").maybeSingle();
  if (!p) return { ok: false, error: "Already settled." };
  const b = p.bookings;
  if (b?.status === "confirmed" && b.class_sessions && new Date(b.class_sessions.starts_at) > new Date()) {
    return { ok: false, error: "This class is still booked. Remove the client from the class instead." };
  }
  await db().from("payments").update({ status: "cancelled" }).eq("id", paymentId).eq("status", "pending");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Record an in-person renewal for an offline monthly package and grant the next period. */
export async function renewMembership(membershipId: string, method: "cash" | "card_in_person" | "bank_transfer" | "revolut"): Promise<ActionResult> {
  await admin("renew_membership", { membershipId, method });
  const { data: m } = await db().from("memberships").select("*, products!memberships_product_id_fkey(*)").eq("id", membershipId).single();
  if (!m) return { ok: false, error: "Membership not found." };
  const productId = m.next_product_id ?? m.product_id;
  const { data: prod } = await db().from("products").select("*").eq("id", productId).single();
  const { data: pay } = await db().from("payments").insert({
    profile_id: m.profile_id, provider: "offline", amount_cents: prod!.price_cents, purpose: "renewal", membership_id: m.id,
    product_id: productId, description: `${prod!.name} (renewal)`, status: "pending",
  }).select("id").single();
  await onPaymentPaid(pay!.id, undefined, method);
  revalidatePath(`/admin/clients/${m.profile_id}`);
  return { ok: true, message: "Renewed. Next period's classes added." };
}

export async function setMembershipState(membershipId: string, action: "pause" | "resume" | "cancel" | "reactivate"): Promise<ActionResult> {
  await admin("membership_" + action, { membershipId });
  if (action === "pause") await db().rpc("pause_membership", { p_membership: membershipId });
  if (action === "resume") await db().rpc("resume_membership", { p_membership: membershipId });
  if (action === "cancel") await db().from("memberships").update({ cancel_at_period_end: true }).eq("id", membershipId);
  if (action === "reactivate") await db().from("memberships").update({ cancel_at_period_end: false }).eq("id", membershipId);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function changeMembershipProduct(membershipId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("membership_change", { membershipId });
  const productId = String(form.get("product_id"));
  await db().from("memberships").update({ next_product_id: productId }).eq("id", membershipId);
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
  let people = 0;
  for (const s of list ?? []) people += await cancelSession(s.id, reason);
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Cancelled ${list?.length ?? 0} classes. ${people} client${people === 1 ? "" : "s"} notified and credited.` };
}

// ── Students & holidays ────────────────────────────────────────────────
/** Verified in person after seeing a student card. We never store card images. */
export async function setStudent(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("student_verification", { profileId });
  const until = String(form.get("student_verified_until") ?? "");
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: "Pick a valid date." };
  await db().from("profiles").update({ student_verified_until: until || null }).eq("id", profileId);
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
  await admin("confirm_closure", { closureId });
  const { data: c } = await db().from("closures").select("*").eq("id", closureId).single();
  if (!c) return { ok: false, error: "Not found." };
  const { data: list } = await db().from("class_sessions").select("id").eq("status", "scheduled")
    .gte("starts_at", localToUtc(c.starts_on, "00:00")).lt("starts_at", localToUtc(addDaysKey(c.ends_on, 1), "00:00"));
  let people = 0;
  for (const s of list ?? []) people += await cancelSession(s.id, `The studio is closed (${c.name}).`);
  const { data: frozen } = await db().rpc("apply_closure", { p_closure: closureId });
  revalidatePath("/admin/closures");
  return { ok: true, message: `${c.name} confirmed: ${list?.length ?? 0} classes cancelled (${people} clients credited), ${frozen ?? 0} packages extended.` };
}

export async function dismissClosure(closureId: string) {
  await admin("dismiss_closure", { closureId });
  await db().from("closures").delete().eq("id", closureId).eq("confirmed", false);
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
  const num = (k: string) => Number(form.get(k));
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const revolut = String(form.get("revolut_link") ?? "").trim();
  if (revolut && !/^https:\/\/[^\s"'<>]+$/.test(revolut)) return { ok: false, error: "The Revolut link must start with https://" };
  const wantOnline = form.get("online_payments_enabled") === "on";
  if (wantOnline && !(await paymentsUnlocked())) {
    return { ok: false, error: "Online payments stay off until every item under “Before online payments” is ticked in Compliance." };
  }
  const offsets = str("reminder_offsets").split(",").map((s) => Math.round(Number(s.trim()) * 60)).filter((n) => n > 0 && n <= 10080);
  const { error } = await db().from("studio_settings").update({
    cancellation_cutoff_hours: num("cancellation_cutoff_hours"),
    waitlist_window_minutes: Math.round(num("waitlist_window_hours") * 60),
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
    policy_version: str("policy_version"),
    booking_window_days: Math.round(num("booking_window_weeks") * 7) || 28,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  if (error) return { ok: false, error: "Some values are out of range. Please check them." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function saveClassType(id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_class_type", { id });
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind")) as "reformer" | "mat" | "event";
  if (!name || !["reformer", "mat", "event"].includes(kind)) return { ok: false, error: "Name and kind are required." };
  const row = {
    name, kind,
    slug: id ? undefined : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36),
    credit_kind: kind === "event" ? null : kind,
    default_capacity: Number(form.get("default_capacity")),
    default_duration_minutes: Number(form.get("default_duration_minutes")),
    price_cents: Math.round(Number(String(form.get("price")).replace(",", ".")) * 100),
    credit_cost: Math.max(1, Math.min(10, Number(form.get("credit_cost")) || 1)),
    description: String(form.get("description") ?? "").trim() || null,
    default_location: String(form.get("default_location") ?? "").trim() || null,
    active: form.get("active") === "on",
  };
  const { error } = id ? await db().from("class_types").update({ ...row, slug: undefined }).eq("id", id) : await db().from("class_types").insert({ ...row, slug: row.slug! });
  if (error) return { ok: false, error: "Couldn't save. Check capacity (1–100), duration and price." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}

export async function saveProduct(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_product", { id });
  const { error } = await db().from("products").update({
    name: String(form.get("name") ?? "").trim(),
    credits: Number(form.get("credits")),
    price_cents: Math.round(Number(String(form.get("price")).replace(",", ".")) * 100),
    validity_days: Number(form.get("validity_days")) || null,
    period_days: Number(form.get("period_days")) || null,
    description: String(form.get("description") ?? "").trim() || null,
    active: form.get("active") === "on",
    ...(form.has("per_week") ? { per_week: Number(form.get("per_week")) || null, months: Number(form.get("months")) || null } : {}),
  }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}

/** The Package prices grid: one price per product. */
export async function savePrices(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_prices");
  const updates: { id: string; cents: number }[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("price_")) continue;
    const id = k.slice(6);
    const cents = Math.round(Number(String(v).replace(",", ".").replace("€", "")) * 100);
    if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isFinite(cents) || cents < 0 || cents > 1_000_000) return { ok: false, error: "Please check the prices (numbers only, e.g. 130)." };
    updates.push({ id, cents });
  }
  for (const u of updates) await db().from("products").update({ price_cents: u.cents }).eq("id", u.id);
  revalidatePath("/admin/settings");
  revalidatePath("/packs");
  return { ok: true, message: "Prices saved." };
}

export async function toggleCompliance(key: string, done: boolean) {
  await admin("compliance", { key, done });
  await db().from("compliance_items").update({ done, updated_at: new Date().toISOString() }).eq("key", key);
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

export async function runTickNow(): Promise<ActionResult> {
  await admin("run_tick");
  const r = await runTick("admin");
  revalidatePath("/admin/outbox");
  return { ok: true, message: `Done: ${r.reminders} reminders, ${r.offers} waitlist offers.` };
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

export async function importClients(rows: Record<string, unknown>[]): Promise<ActionResult<{ created: number; updated: number; skipped: number }>> {
  await admin("import_clients", { count: rows.length });
  let created = 0, updated = 0, skipped = 0;
  for (const raw of rows.slice(0, 2000)) {
    const r = ImportClient.safeParse(raw);
    if (!r.success) { skipped++; continue; }
    const c = r.data;
    const existing = c.email ? (await db().from("profiles").select("id").ilike("email", c.email).is("deleted_at", null).maybeSingle()).data : null;
    let id = existing?.id;
    if (id) { await db().from("profiles").update({ full_name: c.full_name, phone: c.phone ?? undefined, admin_notes: c.notes ?? undefined }).eq("id", id); updated++; }
    else {
      const { data } = await db().from("profiles").insert({ full_name: c.full_name, email: c.email, phone: c.phone, admin_notes: c.notes }).select("id").single();
      id = data?.id; created++;
    }
    if (!id) continue;
    const expires = c.credits_expire && !Number.isNaN(Date.parse(c.credits_expire)) ? new Date(c.credits_expire).toISOString() : null;
    for (const [kind, n] of [["reformer", c.reformer_credits], ["mat", c.mat_credits]] as const) {
      if (!n) continue;
      await db().rpc("grant_lot", { p_profile: id, p_kind: kind, p_credits: n, p_expires: expires as string /* null = never expires */, p_note: "Imported balance" });
    }
  }
  revalidatePath("/admin/clients");
  return { ok: true, data: { created, updated, skipped } };
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
    slots.push({ weekday: day, time, class_type_id: type.id, capacity: r.capacity ? Number(r.capacity) : null });
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
  const intro = String(form.get("intro_line") ?? "").trim();
  if (intro) await db().from("studio_settings").update({ intro_line: intro.slice(0, 300) }).eq("id", 1);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Your changes are live." };
}

/** Add someone to the studio team (admin access). They sign in with this email. */
export async function addTeamMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("team_add");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Enter a valid email." };
  const { data: existing } = await db().from("profiles").select("id").ilike("email", email).is("deleted_at", null).maybeSingle();
  if (existing) await db().from("profiles").update({ role: "admin" }).eq("id", existing.id);
  else await db().from("profiles").insert({ email, role: "admin", full_name: String(form.get("name") ?? "").trim() || null });
  revalidatePath("/admin/team");
  return { ok: true, message: `${email} can now sign in to the studio admin.` };
}

export async function removeTeamMember(profileId: string): Promise<ActionResult> {
  const viewer = await admin("team_remove", { profileId });
  if (profileId === viewer.profile.id) return { ok: false, error: "You can't remove yourself." };
  await db().from("profiles").update({ role: "client" }).eq("id", profileId);
  revalidatePath("/admin/team");
  return { ok: true };
}
