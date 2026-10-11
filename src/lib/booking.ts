import "server-only";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getSettings, type Profile } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { paymentProvider } from "@/lib/payments";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { spokenDateTime, time, relativeHours } from "@/lib/time";
import { eur, vatPortion } from "@/lib/money";

type OfferRow = { entry_id: string; profile_id: string; offer_expires_at: string };

export async function sessionInfo(sessionId: string) {
  const { data } = await db()
    .from("class_sessions")
    .select("*, class_types(*)")
    .eq("id", sessionId)
    .single();
  if (!data) throw new Error("not_found");
  const type = data.class_types!;
  return {
    ...data,
    type,
    name: data.title ?? type.name,
    price: data.price_cents ?? type.price_cents,
    where: data.location ?? type.default_location,
  };
}
export type SessionInfo = Awaited<ReturnType<typeof sessionInfo>>;

const tmpl = (s: SessionInfo) => ({ className: s.name, when: spokenDateTime(s.starts_at), location: s.where });

async function profileById(id: string) {
  const { data } = await db().from("profiles").select("*").eq("id", id).single();
  return data!;
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export async function bookWithCredit(profile: Profile, sessionId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: "credit" });
  if (error) return { ok: false, error: friendlyError(error) };
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  await notify({ profileId: profile.id, email: profile.email, phone: profile.phone }, "booking_confirmed",
    { name: profile.full_name ?? undefined, ...tmpl(s), note: "1 credit used." }, { bookingId, sessionId });
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

export async function bookWithPayment(profile: Profile, sessionId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: "payment" });
  if (error) return { ok: false, error: friendlyError(error) };
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  const cfg = await getSettings();
  const description = `${s.name} · ${spokenDateTime(s.starts_at)}`;
  const { data: pay } = await db()
    .from("payments")
    .insert({
      profile_id: profile.id, provider: paymentProvider().name, amount_cents: s.price,
      vat_cents: vatPortion(s.price, Number(cfg.vat_rate), cfg.vat_registered),
      purpose: "booking", booking_id: bookingId, description,
    })
    .select("id")
    .single();
  try {
    const checkout = await paymentProvider().createCheckout({
      paymentId: pay!.id, amountCents: s.price, description, customerEmail: profile.email,
      successUrl: `${env.siteUrl}/bookings/${bookingId}/confirmed?payment=${pay!.id}`,
      cancelUrl: `${env.siteUrl}/book/${sessionId}?cancelled=1`,
    });
    await db().from("payments").update({ provider_ref: checkout.providerRef }).eq("id", pay!.id);
    return { ok: true, data: { redirect: checkout.url } };
  } catch (e) {
    console.error("checkout failed", e);
    await db().rpc("cancel_booking", { p_booking: bookingId, p_profile: profile.id });
    await db().from("payments").update({ status: "failed" }).eq("id", pay!.id);
    return { ok: false, error: "We couldn't open the payment page. Please try again." };
  }
}

export async function buyPack(profile: Profile, productId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data: product } = await db().from("products").select("*").eq("id", productId).eq("active", true).single();
  if (!product) return { ok: false, error: "That pack isn't available." };
  const cfg = await getSettings();
  const { data: pay } = await db()
    .from("payments")
    .insert({
      profile_id: profile.id, provider: paymentProvider().name, amount_cents: product.price_cents,
      vat_cents: vatPortion(product.price_cents, Number(cfg.vat_rate), cfg.vat_registered),
      purpose: "pack", product_id: product.id, description: product.name,
    })
    .select("id")
    .single();
  const checkout = await paymentProvider().createCheckout({
    paymentId: pay!.id, amountCents: product.price_cents, description: product.name, customerEmail: profile.email,
    successUrl: `${env.siteUrl}/bookings?purchased=${pay!.id}`,
    cancelUrl: `${env.siteUrl}/packs?cancelled=1`,
  });
  await db().from("payments").update({ provider_ref: checkout.providerRef }).eq("id", pay!.id);
  return { ok: true, data: { redirect: checkout.url } };
}

/** Called by the Stripe webhook or the mock checkout once money has moved. */
export async function onPaymentPaid(paymentId: string, providerRef?: string) {
  const { data, error } = await db().rpc("confirm_payment", { p_payment: paymentId, p_provider_ref: providerRef });
  if (error) throw error;
  const res = data as { status: string; booking_id?: string };
  const { data: pay } = await db().from("payments").select("*, products(*)").eq("id", paymentId).single();
  if (!pay?.profile_id) return res;
  const profile = await profileById(pay.profile_id);
  const to = { profileId: profile.id, email: profile.email, phone: profile.phone };
  if (res.status === "confirmed" && res.booking_id) {
    const { data: b } = await db().from("bookings").select("session_id").eq("id", res.booking_id).single();
    const s = await sessionInfo(b!.session_id);
    await notify(to, "booking_confirmed", { name: profile.full_name ?? undefined, ...tmpl(s), note: `Paid ${eur(pay.amount_cents)}.` },
      { bookingId: res.booking_id, sessionId: s.id, dedupeKey: `confirmed:${res.booking_id}` });
  } else if (res.status === "credits_added" && pay.products) {
    await notify(to, "credits_added", { name: profile.full_name ?? undefined, note: `${pay.products.credits} ${pay.products.credit_kind} credits are in your account.` },
      { dedupeKey: `credits:${paymentId}` });
  }
  return res;
}

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------
export async function joinWaitlist(profile: Profile, sessionId: string): Promise<ActionResult<{ position: number }>> {
  const { data, error } = await db().rpc("join_waitlist", { p_profile: profile.id, p_session: sessionId });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: { position: (data as { position: number }).position } };
}

export async function leaveWaitlist(profile: Profile, entryId: string): Promise<ActionResult> {
  const { data, error } = await db().rpc("leave_waitlist", { p_profile: profile.id, p_entry: entryId });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyOffers((data ?? []) as OfferRow[]);
  return { ok: true };
}

export async function notifyOffers(rows: OfferRow[]) {
  for (const r of rows) {
    const { data: w } = await db().from("waitlist_entries").select("session_id").eq("id", r.entry_id).single();
    if (!w) continue;
    const [s, p] = await Promise.all([sessionInfo(w.session_id), profileById(r.profile_id)]);
    await notify({ profileId: p.id, email: p.email, phone: p.phone }, "waitlist_offer",
      { name: p.full_name ?? undefined, ...tmpl(s), note: `It's held for you until ${time(r.offer_expires_at)} (${relativeHours(r.offer_expires_at)}). After that it goes to the next person.` },
      { sms: true, sessionId: s.id, dedupeKey: `offer:${r.entry_id}` });
  }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------
export async function cancelBooking(profile: Profile, bookingId: string, asAdmin = false): Promise<ActionResult<{ status: string }>> {
  const { data, error } = await db().rpc("cancel_booking", { p_booking: bookingId, p_profile: profile.id, p_admin: asAdmin });
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { status: string; session_id: string };
  const { data: b } = await db().from("bookings").select("profile_id, paid_with, late_refund_pending").eq("id", bookingId).single();
  const s = await sessionInfo(res.session_id);
  if (res.status !== "released" && b) {
    const owner = await profileById(b.profile_id);
    const note = res.status === "cancelled"
      ? b.paid_with === "credit" || (b.paid_with === "payment" && s.type.credit_kind)
        ? "Your credit is back in your account."
        : b.paid_with === "payment" ? "We'll refund your payment." : ""
      : b.late_refund_pending
        ? "This was inside the cancellation window. If your spot is re-booked, we'll return your credit."
        : "This was inside the cancellation window, so no credit is returned. Thank you for freeing the spot.";
    await notify({ profileId: owner.id, email: owner.email, phone: owner.phone }, "cancellation_confirmed",
      { name: owner.full_name ?? undefined, ...tmpl(s), note }, { bookingId, sessionId: s.id, dedupeKey: `cancel:${bookingId}` });
  }
  const { data: offers } = await db().rpc("process_waitlist", { p_session: res.session_id });
  await notifyOffers((offers ?? []) as OfferRow[]);
  return { ok: true, data: { status: res.status } };
}

export async function cancelSession(sessionId: string, reason: string) {
  const s = await sessionInfo(sessionId);
  const { data, error } = await db().rpc("cancel_session", { p_session: sessionId, p_reason: reason });
  if (error) throw error;
  for (const row of (data ?? []) as { booking_id: string; profile_id: string }[]) {
    const p = await profileById(row.profile_id);
    await notify({ profileId: p.id, email: p.email, phone: p.phone }, "class_cancelled",
      { name: p.full_name ?? undefined, ...tmpl(s), note: reason || undefined },
      { sms: true, bookingId: row.booking_id, sessionId, dedupeKey: `session-cancel:${row.booking_id}` });
  }
  return (data ?? []).length;
}

// ---------------------------------------------------------------------------
// Periodic work: waitlist offers + reminders. Safe to call often (deduplicated).
// ---------------------------------------------------------------------------
export async function runTick() {
  const { data: offers } = await db().rpc("tick");
  await notifyOffers((offers ?? []) as OfferRow[]);

  const cfg = await getSettings();
  const offsets = [...cfg.reminder_offsets_minutes].sort((a, b) => a - b); // e.g. [120, 1440]
  let sent = 0;
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    const smaller = i > 0 ? offsets[i - 1] : 0;
    const now = Date.now();
    const { data: rows } = await db()
      .from("bookings")
      .select("id, confirmed_at, profile_id, session_id, class_sessions!inner(starts_at, status)")
      .eq("status", "confirmed")
      .eq("class_sessions.status", "scheduled")
      .gt("class_sessions.starts_at", new Date(now + smaller * 60_000).toISOString())
      .lte("class_sessions.starts_at", new Date(now + offset * 60_000).toISOString());
    for (const b of rows ?? []) {
      const start = new Date(b.class_sessions.starts_at).getTime();
      // Booked after this reminder would have gone out: the confirmation is enough.
      if (b.confirmed_at && new Date(b.confirmed_at).getTime() > start - offset * 60_000) continue;
      const [s, p] = await Promise.all([sessionInfo(b.session_id), profileById(b.profile_id)]);
      const template = offset <= 180 ? "reminder_2h" : "reminder_24h";
      await notify({ profileId: p.id, email: p.email, phone: p.phone }, template,
        { name: p.full_name ?? undefined, ...tmpl(s), when: offset <= 180 ? time(s.starts_at) : spokenDateTime(s.starts_at),
          note: `Need to cancel? You can until ${cfg.cancellation_cutoff_hours}h before class.` },
        { sms: offset <= 180, bookingId: b.id, sessionId: s.id, dedupeKey: `reminder:${offset}:${b.id}` });
      sent++;
    }
  }
  return { offers: (offers ?? []).length, reminders: sent };
}
