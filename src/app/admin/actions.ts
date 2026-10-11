"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { cancelBooking, cancelSession, notifyOffers, runTick, sessionInfo } from "@/lib/booking";
import { notify } from "@/lib/notifications";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { localToUtc, spokenDateTime } from "@/lib/time";
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
      { name: p.full_name ?? undefined, className: s.name, when: spokenDateTime(s.starts_at), location: s.where },
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

// ── Timetable ──────────────────────────────────────────────────────────
const Slot = z.object({ weekday: z.number().int().min(1).max(7), time: z.string().regex(/^\d{2}:\d{2}$/), class_type_id: z.string().uuid(), capacity: z.number().int().min(1).max(100).nullable().optional() });

export async function saveTimetable(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_timetable");
  const name = String(form.get("name") ?? "").trim() || "Timetable";
  const from = String(form.get("valid_from")); const to = String(form.get("valid_to"));
  const slots = z.array(Slot).safeParse(JSON.parse(String(form.get("slots") ?? "[]")));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { ok: false, error: "Pick a valid date range." };
  if (!slots.success || slots.data.length === 0) return { ok: false, error: "Add at least one class time." };
  const { data: t, error } = await db().from("timetable_templates").insert({ name, valid_from: from, valid_to: to }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the timetable." };
  const unique = new Map(slots.data.map((s) => [`${s.weekday}-${s.time}`, s]));
  await db().from("template_slots").insert([...unique.values()].map((s) => ({ template_id: t.id, weekday: s.weekday, start_time: s.time, class_type_id: s.class_type_id, capacity: s.capacity ?? null })));
  const { data: n } = await db().rpc("generate_sessions", { p_template: t.id });
  revalidatePath("/admin/timetable");
  return { ok: true, message: `Timetable saved. ${n} new classes created (existing classes were kept).` };
}

// ── Clients ────────────────────────────────────────────────────────────
export async function updateClient(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("update_client", { profileId });
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  if (email && !z.string().email().safeParse(email).success) return { ok: false, error: "Invalid email." };
  const { error } = await db().from("profiles").update({
    full_name: String(form.get("full_name") ?? "").trim() || null,
    phone: String(form.get("phone") ?? "").trim() || null,
    email,
    admin_notes: String(form.get("admin_notes") ?? "").trim() || null,
  }).eq("id", profileId);
  if (error) return { ok: false, error: error.code === "23505" ? "Another client already uses that email." : "Couldn't save." };
  revalidatePath(`/admin/clients/${profileId}`);
  return { ok: true, message: "Saved." };
}

export async function adjustCredits(profileId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("adjust_credits", { profileId });
  const kind = form.get("kind") === "mat" ? "mat" : "reformer";
  const amount = Number(form.get("amount"));
  const days = Number(form.get("days") || 0);
  if (!Number.isInteger(amount) || amount < 1 || amount > 50) return { ok: false, error: "Enter between 1 and 50 credits." };
  const { data: lot } = await db().from("credit_lots").insert({
    profile_id: profileId, credit_kind: kind, total: amount, remaining: amount,
    expires_at: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null, note: String(form.get("note") || "Added by studio"),
  }).select("id").single();
  await db().from("credit_ledger").insert({ profile_id: profileId, lot_id: lot!.id, credit_kind: kind, delta: amount, reason: "admin_adjust" });
  revalidatePath(`/admin/clients/${profileId}`);
  return { ok: true, message: `${amount} ${kind} credit${amount === 1 ? "" : "s"} added.` };
}

export async function removeCredit(profileId: string, lotId: string) {
  await admin("remove_credit", { profileId, lotId });
  const { data: lot } = await db().from("credit_lots").select("*").eq("id", lotId).eq("profile_id", profileId).single();
  if (!lot || lot.remaining < 1) return;
  await db().from("credit_lots").update({ remaining: lot.remaining - 1 }).eq("id", lotId);
  await db().from("credit_ledger").insert({ profile_id: profileId, lot_id: lotId, credit_kind: lot.credit_kind, delta: -1, reason: "admin_adjust" });
  revalidatePath(`/admin/clients/${profileId}`);
}

// ── Settings ───────────────────────────────────────────────────────────
export async function saveSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  await admin("save_settings");
  const num = (k: string) => Number(form.get(k));
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const offsets = str("reminder_offsets").split(",").map((s) => Math.round(Number(s.trim()) * 60)).filter((n) => n > 0 && n <= 10080);
  const { error } = await db().from("studio_settings").update({
    cancellation_cutoff_hours: num("cancellation_cutoff_hours"),
    waitlist_window_minutes: Math.round(num("waitlist_window_hours") * 60),
    hold_minutes: num("hold_minutes"),
    reminder_offsets_minutes: offsets.length ? offsets : [1440, 120],
    refund_late_cancel_if_filled: form.get("refund_late_cancel_if_filled") === "on",
    vat_registered: form.get("vat_registered") === "on",
    vat_rate: num("vat_rate"),
    legal_name: str("legal_name"), address: str("address"), registration_number: str("registration_number"), vat_number: str("vat_number"),
    contact_email: str("contact_email"), contact_phone: str("contact_phone"), instagram_handle: str("instagram_handle").replace(/^@/, ""),
    intro_line: str("intro_line"), policy_version: str("policy_version"),
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
    active: form.get("active") === "on",
  }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}

export async function toggleCompliance(key: string, done: boolean) {
  await admin("compliance", { key, done });
  await db().from("compliance_items").update({ done, updated_at: new Date().toISOString() }).eq("key", key);
  revalidatePath("/admin/compliance");
}

export async function runTickNow(): Promise<ActionResult> {
  await admin("run_tick");
  const r = await runTick();
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
      const { data: lot } = await db().from("credit_lots").insert({ profile_id: id, credit_kind: kind, total: n, remaining: n, expires_at: expires, note: "Imported balance" }).select("id").single();
      await db().from("credit_ledger").insert({ profile_id: id, lot_id: lot!.id, credit_kind: kind, delta: n, reason: "import" });
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
  if (process.env.DEMO_MODE !== "true") return { ok: false, error: "Reset is only available in demo mode." };
  await admin("reset_demo_data");
  const { error } = await db().rpc("reset_demo_data");
  if (error) return { ok: false, error: "Reset failed. Check the server logs." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data reset. Fresh classes, clients and bookings are ready." };
}
