import "server-only";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getSettings, type Profile } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { paymentProvider } from "@/lib/payments";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { spokenDateTime, time, relativeHours, todayKey } from "@/lib/time";
import { eur, vatPortion } from "@/lib/money";
import { applyRecurring } from "@/lib/recurring";

type OfferRow = { entry_id: string; profile_id: string; offer_expires_at: string | null };

export async function sessionInfo(sessionId: string) {
  const { data } = await db()
    .from("class_sessions")
    .select("*, class_types(*)")
    .eq("id", sessionId)
    .single();
  if (!data) throw new Error("not_found");
  const type = data.class_types!;
  const cutoff = (await getSettings()).cancellation_cutoff_hours;
  return {
    cutoff,
    cancelBy: new Date(new Date(data.starts_at).getTime() - cutoff * 3_600_000),
    ...data,
    type,
    name: data.title ?? type.name,
    price: data.price_cents ?? type.price_cents,
    where: data.location ?? type.default_location,
  };
}
export type SessionInfo = Awaited<ReturnType<typeof sessionInfo>>;

export const EVENT_POLICY = "Events can't be cancelled or refunded in the app. If you can't make it, message the studio.";

/** The cancellation policy, stated in every booking email. */
export const policyLine = (cancelBy: Date, cutoff: number) =>
  `Free cancellation until ${spokenDateTime(cancelBy)} (${cutoff}h before class). Later cancellations and no-shows aren't refunded.`;

const tmpl = (s: SessionInfo) => ({
  className: s.name, when: spokenDateTime(s.starts_at), location: s.where,
  // Events carry her own terms; they can't be cancelled or refunded in the app.
  policy: s.type.kind === "event" ? s.event_policy ?? EVENT_POLICY : policyLine(s.cancelBy, s.cutoff),
});

async function profileById(id: string) {
  const { data } = await db().from("profiles").select("*").eq("id", id).single();
  return data!;
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export async function bookWithCredit(profile: Profile, sessionId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: "credit" });
  if (error?.message === "beyond_expiry") {
    const s = await sessionInfo(sessionId);
    const { data: u } = await db().rpc("usable_credits", { p_profile: profile.id, p_kind: s.type.credit_kind!, p_class: s.starts_at });
    const until = u?.[0]?.latest_expiry;
    return { ok: false, error: `Your package is valid until ${until ? spokenDateTime(new Date(new Date(until).getTime() - 1)).split(",")[0] : "before this class"}, so this class can't be booked with it. A new package will cover it.` };
  }
  if (error) return { ok: false, error: friendlyError(error) };
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  await notify({ profileId: profile.id, email: profile.email, phone: profile.phone }, "booking_confirmed",
    { name: profile.full_name ?? undefined, ...tmpl(s), note: "1 credit used." }, { bookingId, sessionId });
  await alertBooking(profile, sessionId, "with a class from their package", bookingId);
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

export async function bookWithPayment(profile: Profile, sessionId: string): Promise<ActionResult<{ redirect: string }>> {
  if (!(await getSettings()).online_payments_enabled) return { ok: false, error: "Online payment isn't available yet. Reserve and pay at the studio." };
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
    await alertBooking(profile, sessionId, `paying ${eur(s.price)} online`, bookingId);
    return { ok: true, data: { redirect: checkout.url } };
  } catch (e) {
    console.error("checkout failed", e);
    await db().rpc("cancel_booking", { p_booking: bookingId, p_profile: profile.id });
    await db().from("payments").update({ status: "failed" }).eq("id", pay!.id);
    return { ok: false, error: "We couldn't open the payment page. Please try again." };
  }
}

/** Reserve now, pay at the studio (cash or card in person). */
export async function bookAtStudio(profile: Profile, sessionId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: "pay_at_studio" });
  if (error) {
    if (error.message === "unpaid_limit") return { ok: false, error: "You already have a class to pay for at the studio. Once it's settled you can reserve another, or get a package." };
    if (error.message === "pay_later_off") return { ok: false, error: "Please get a package or class credits at the studio first." };
    return { ok: false, error: friendlyError(error) };
  }
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  await notify({ profileId: profile.id, email: profile.email, phone: profile.phone }, "booking_confirmed",
    { name: profile.full_name ?? undefined, ...tmpl(s), note: `Please pay ${eur(s.price)} at the studio (cash or card).` }, { bookingId, sessionId });
  await alertBooking(profile, sessionId, `to pay ${eur(s.price)} at the studio`, bookingId);
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

/** Trial or drop-in (or a paid event): reserve the spot, pay by cash or Revolut, the studio marks it paid. */
export async function bookSingle(profile: Profile, sessionId: string, mode: "trial" | "drop_in", method: "cash" | "revolut", code?: string | null): Promise<ActionResult<{ redirect: string }>> {
  // A code or reward (her ticks: trial / drop-in / event): checked before the spot is reserved.
  let found: Awaited<ReturnType<typeof findCode>> | null = null;
  if (code?.trim()) {
    const first = await sessionInfo(sessionId);
    found = await findCode(profile.id, code, undefined, first.type.kind === "event" ? "event" : mode);
    if (!found.ok) return found;
  }
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: mode, p_method: method });
  if (error) return { ok: false, error: friendlyError(error) };
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  let { data: pay } = await db().from("payments").select("id, amount_cents").eq("booking_id", bookingId).single();
  if (found?.ok && pay) {
    const d = withDiscount(pay.amount_cents, pay.amount_cents, found.discount);
    if (d.applies && d.cents < pay.amount_cents) {
      const note = `${found.discount.personal ? "Reward" : `Code ${found.discount.code}`}: ${found.discount.label}`;
      const { error: e } = await db().from("payments").update({ amount_cents: d.cents, discount_code_id: found.discount.id, discount_note: note }).eq("id", pay.id);
      if (!e) pay = { ...pay, amount_cents: d.cents };
    }
  }
  const how = method === "revolut" ? "by Revolut" : "in cash at the studio";
  await notify({ profileId: profile.id, email: profile.email, phone: profile.phone }, "booking_confirmed",
    { name: profile.full_name ?? undefined, ...tmpl(s), note: `${mode === "trial" ? "Your trial class. " : ""}Please pay ${eur(pay?.amount_cents ?? s.price)} ${how} before class (reference ${paymentReference(pay!.id)}).` },
    { bookingId, sessionId });
  const what = s.type.kind === "event" ? "a spot" : mode === "trial" ? "a trial" : "a drop-in";
  await alertBooking(profile, sessionId, `${what}, paying ${eur(pay?.amount_cents ?? s.price)} ${method === "revolut" ? "by Revolut" : "in cash"}`, bookingId);
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

/** A free event (price €0): booked straight away, no payment question. The database refuses it if the event isn't free. */
export async function bookFree(profile: Profile, sessionId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: "free" });
  if (error) return { ok: false, error: friendlyError(error) };
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  await notify({ profileId: profile.id, email: profile.email, phone: profile.phone }, "booking_confirmed",
    { name: profile.full_name ?? undefined, ...tmpl(s) }, { bookingId, sessionId });
  await alertBooking(profile, sessionId, "a free spot", bookingId);
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

/** Their answer to the event's question (e.g. dietary needs), kept on the booking for the studio. */
export async function saveAnswer(profileId: string, sessionId: string, answer: string) {
  const text = answer.trim().slice(0, 500);
  if (!text) return;
  await db().from("bookings").update({ answer: text }).eq("session_id", sessionId).eq("profile_id", profileId).in("status", ["confirmed", "held"]);
}

/**
 * Buy a class pack or monthly package. With online payments off (default while the
 * studio isn't registered) this records a request to pay at the studio; the admin's
 * "Mark as paid" then grants the credits through the same ledger.
 */
export async function buyProduct(profile: Profile, productId: string, method: "cash" | "revolut" | "bank_transfer" = "cash", code?: string | null): Promise<ActionResult<{ redirect: string }>> {
  const { data: product } = await db().from("products").select("*").eq("id", productId).eq("active", true).single();
  if (!product) return { ok: false, error: "That package isn't available." };
  // A tab she hasn't shown yet (e.g. Private): only the studio can request from it (to try it out).
  if (profile.role !== "admin" && product.credit_kind) {
    const tab = (await getKinds()).find((k) => k.key === product.credit_kind)?.tab;
    const t = (await getTabs()).find((x) => x.key === tab);
    if (t && !t.visible) return { ok: false, error: "That package isn't available yet." };
  }
  const cfg = await getSettings();
  const purpose = product.kind === "membership" ? "membership" : "pack";

  if (product.kind === "membership") {
    const { data: live } = await db().from("memberships").select("id").eq("profile_id", profile.id).in("status", ["active", "paused", "past_due"]).maybeSingle();
    if (live) return { ok: false, error: "You already have a monthly package. You can change it from your Membership page." };
  }

  if (!cfg.online_payments_enabled) {
    const { data: existing } = await db().from("payments").select("id, amount_cents").eq("profile_id", profile.id).eq("product_id", product.id).eq("status", "pending").eq("provider", "offline").maybeSingle();
    const price = await packagePrice(profile, product, cfg, code, existing?.id);
    if (!price.ok) return price;
    const fields = { intended_method: method, amount_cents: price.cents, discount_code_id: price.codeId, discount_note: price.note };
    let payId = existing?.id;
    if (existing) {
      const { error } = await db().from("payments").update(fields).eq("id", existing.id);
      if (error) return { ok: false, error: friendlyError(error) };
    } else {
      const { data: pay, error } = await db().from("payments").insert({
        ...fields, profile_id: profile.id, provider: "offline", purpose, product_id: product.id, description: product.name, status: "pending",
      }).select("id").single();
      if (error) return { ok: false, error: friendlyError(error) };
      payId = pay.id;
    }
    if (!existing) await alertStudio("requests", `Package request: ${profile.full_name ?? profile.email ?? "a client"}`,
      [`${product.name} · ${eur(price.cents)}${price.note ? ` (${price.note})` : ""}`, `They'll pay ${method === "revolut" ? "by Revolut" : method === "bank_transfer" ? "by bank transfer" : "in cash"}. Tap Mark as paid on Today once you have it.`],
      { path: "/admin", dedupeKey: `request:${payId}` });
    // A new request, or the same one at a new price (a code added or taken off): send the instructions again.
    if (!existing || existing.amount_cents !== price.cents) {
      await notify({ profileId: profile.id, email: profile.email }, "payment_request",
        { name: profile.full_name ?? undefined, className: product.name, note: `${paymentInstructions(cfg, price.cents, paymentReference(payId!))}${price.note ? ` (${price.note})` : ""}` },
        { dedupeKey: `request:${payId}:${price.cents}` });
    }
    return { ok: true, data: { redirect: "/bookings?requested=1" } };
  }

  return product.kind === "membership" ? startSubscription(profile, product) : buyPack(profile, productId, code);
}

/** The real price of a package for this client: student price, or a reward / code when it's lower; free classes on top. */
async function packagePrice(
  profile: Profile, product: Parameters<typeof productPrice>[0] & { kind: string }, cfg: Awaited<ReturnType<typeof getSettings>>,
  code: string | null | undefined, except?: string,
): Promise<{ ok: true; cents: number; codeId: string | null; note: string | null } | { ok: false; error: string }> {
  const base = productPrice(product, profile, cfg);
  const studentNote = base.student ? `Student ${cfg.student_discount_pct}%` : null;
  if (!code?.trim() || product.kind === "membership") return { ok: true, cents: base.cents, codeId: null, note: studentNote };
  const found = await findCode(profile.id, code, except, "package");
  if (!found.ok) return found;
  const d = withDiscount(product.price_cents, base.cents, found.discount);
  if (!d.applies) return { ok: false, error: "Your student price is already lower than this code, so there's no need to use it." };
  const note = `${found.discount.personal ? "Reward" : `Code ${found.discount.code}`}: ${found.discount.label}${d.extraClasses ? " added" : ""}`;
  return { ok: true, cents: d.cents, codeId: found.discount.id, note: d.extraClasses && studentNote ? `${studentNote} · ${note}` : note };
}

async function startSubscription(profile: Profile, product: { id: string; name: string; price_cents: number; period_days: number | null }): Promise<ActionResult<{ redirect: string }>> {
  const cfg = await getSettings();
  const provider = paymentProvider();
  const { data: pay } = await db().from("payments").insert({
    profile_id: profile.id, provider: provider.name, amount_cents: product.price_cents,
    vat_cents: vatPortion(product.price_cents, Number(cfg.vat_rate), cfg.vat_registered),
    purpose: "membership", product_id: product.id, description: product.name,
  }).select("id").single();
  const req = {
    paymentId: pay!.id, amountCents: product.price_cents, description: product.name, customerEmail: profile.email,
    successUrl: `${env.siteUrl}/membership?started=${pay!.id}`, cancelUrl: `${env.siteUrl}/packs?cancelled=1`,
  };
  const checkout = provider.createSubscriptionCheckout
    ? await provider.createSubscriptionCheckout({ ...req, periodDays: product.period_days ?? 30, calendarMonth: cfg.membership_period_mode === "calendar", customerId: profile.stripe_customer_id, profileId: profile.id, productId: product.id })
    : await provider.createCheckout(req);
  await db().from("payments").update({ provider_ref: checkout.providerRef }).eq("id", pay!.id);
  return { ok: true, data: { redirect: checkout.url } };
}

export { paymentReference, productPrice, paymentInstructions } from "@/lib/pricing";
import { paymentInstructions, paymentReference, productPrice } from "@/lib/pricing";
import { discountLabel, withDiscount } from "@/lib/discount";
import { findCode } from "@/lib/rewards";
import { getKinds, getTabs, kindLabel } from "@/lib/kinds";
import { alertBooking, alertStudio } from "@/lib/studio-alerts";

export async function buyPack(profile: Profile, productId: string, code?: string | null): Promise<ActionResult<{ redirect: string }>> {
  const { data: product } = await db().from("products").select("*").eq("id", productId).eq("active", true).single();
  if (!product) return { ok: false, error: "That pack isn't available." };
  const cfg = await getSettings();
  const price = await packagePrice(profile, product, cfg, code);
  if (!price.ok) return price;
  if (price.cents < 50) return { ok: false, error: "This code can't be used with card checkout. Please message the studio." };
  const { data: pay, error } = await db()
    .from("payments")
    .insert({
      profile_id: profile.id, provider: paymentProvider().name, amount_cents: price.cents,
      vat_cents: vatPortion(price.cents, Number(cfg.vat_rate), cfg.vat_registered),
      purpose: "pack", product_id: product.id, description: product.name, discount_code_id: price.codeId, discount_note: price.note,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyError(error) };
  const checkout = await paymentProvider().createCheckout({
    paymentId: pay!.id, amountCents: price.cents, description: product.name, customerEmail: profile.email,
    successUrl: `${env.siteUrl}/bookings?purchased=${pay!.id}`,
    cancelUrl: `${env.siteUrl}/packs?cancelled=1`,
  });
  await db().from("payments").update({ provider_ref: checkout.providerRef }).eq("id", pay!.id);
  return { ok: true, data: { redirect: checkout.url } };
}

/** Called by the Stripe webhook or the mock checkout once money has moved. */
export async function onPaymentPaid(paymentId: string, providerRef?: string, method: "online" | "cash" | "card_in_person" | "bank_transfer" | "revolut" = "online") {
  const { data, error } = await db().rpc("confirm_payment", { p_payment: paymentId, p_provider_ref: providerRef, p_method: method });
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
  } else if (res.status === "membership_active" && pay.products) {
    const { data: m } = await db().from("memberships").select("current_period_end").eq("profile_id", profile.id).in("status", ["active", "paused", "past_due"]).maybeSingle();
    await notify(to, "credits_added", { name: profile.full_name ?? undefined, note: `${pay.products.credits} ${pay.products.credit_kind} classes are in your account${m ? `, valid until ${spokenDateTime(m.current_period_end).split(",")[0]}` : ""}.` },
      { dedupeKey: `credits:${paymentId}` });
  } else if (res.status === "credits_added" && pay.products) {
    const extra = await rewardClasses(pay.id, pay.discount_code_id);
    await notify(to, "credits_added", { name: profile.full_name ?? undefined, note: `${pay.products.credits + extra} ${await kindLabel(pay.products.credit_kind)} classes are in your account${extra ? `, including ${extra} free from your reward` : ""}.` },
      { dedupeKey: `credits:${paymentId}` });
  }
  if (res.status !== "confirmed") await applyRecurring(profile.id);
  return res;
}

/** A "free classes" reward: added to the package the payment just created, as a ledger entry. Runs once (only on credits_added). */
async function rewardClasses(paymentId: string, codeId: string | null) {
  if (!codeId) return 0;
  const { data: c } = await db().from("discount_codes").select("code, kind, value, profile_id").eq("id", codeId).maybeSingle();
  if (!c || c.kind !== "free_classes") return 0;
  const { data: lot } = await db().from("credit_lots").select("id").eq("payment_id", paymentId).order("created_at").limit(1).maybeSingle();
  if (!lot) return 0;
  const { error } = await db().rpc("admin_adjust_lot", {
    p_lot: lot.id, p_action: "add", p_credits: c.value, p_days: 0, p_date: null as unknown as string, p_actor: null as unknown as string,
    p_reason: `${c.profile_id ? "Reward" : `Code ${c.code}`}: ${discountLabel("free_classes", c.value)}`,
  });
  if (error) { console.error("reward classes", error); return 0; }
  return c.value;
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
  const sms = rows.length ? (await getSettings()).waitlist_sms : false; // texts too, when she turned it on and an SMS account is connected
  for (const r of rows) {
    const { data: w } = await db().from("waitlist_entries").select("session_id").eq("id", r.entry_id).single();
    if (!w) continue;
    const [s, p] = await Promise.all([sessionInfo(w.session_id), profileById(r.profile_id)]);
    if (!r.offer_expires_at) {
      // Auto-booked from the waitlist with a class from their package.
      const { data: b } = await db().from("bookings").select("id, free_cancel_until").eq("session_id", s.id).eq("profile_id", p.id).eq("status", "confirmed").maybeSingle();
      // Booked inside the cancellation window: they get a short grace period to cancel for free.
      const grace = b?.free_cancel_until ? ` Can't make it? Cancel in the app by ${time(b.free_cancel_until)} and the class goes back into your package.` : "";
      await alertBooking(p, s.id, "from the waitlist, with a class from their package", b?.id);
      await notify({ profileId: p.id, email: p.email, phone: p.phone }, "waitlist_booked",
        { name: p.full_name ?? undefined, ...tmpl(s), note: `1 class from your package was used.${grace}`, ...(grace ? { policy: undefined } : {}) },
        { sms, sessionId: s.id, bookingId: b?.id, dedupeKey: `waitlist-booked:${r.entry_id}` });
      continue;
    }
    await notify({ profileId: p.id, email: p.email, phone: p.phone }, "waitlist_offer",
      { name: p.full_name ?? undefined, ...tmpl(s), note: `It's held for you until ${time(r.offer_expires_at)} (${relativeHours(r.offer_expires_at)}). After that it goes to the next person.` },
      { sms, sessionId: s.id, dedupeKey: `offer:${r.entry_id}` });
  }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------
export async function cancelBooking(profile: Profile, bookingId: string, asAdmin = false): Promise<ActionResult<{ status: string }>> {
  // Events: no cancellations or refunds for clients; the studio can still remove someone.
  if (!asAdmin) {
    const { data: ev } = await db().from("bookings").select("class_sessions!inner(class_types!inner(kind))").eq("id", bookingId).maybeSingle();
    if (ev?.class_sessions?.class_types?.kind === "event") return { ok: false, error: friendlyError({ message: "event_no_cancel" }) };
  }
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
  if (!asAdmin) {
    const late = res.status !== "cancelled";
    await alertStudio("cancellations", `Cancellation: ${s.name}, ${spokenDateTime(s.starts_at)}`,
      [`${profile.full_name ?? profile.email ?? "A client"} cancelled${late ? ` inside the ${s.cutoff}-hour window (the class isn't returned)` : " in time (the class went back into their package)"}.`,
       "Their spot is open again; the waitlist moves up if anyone is waiting."],
      { path: `/admin/classes/${s.id}`, dedupeKey: `cancel:${bookingId}` });
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
export async function runTick(source: "cron" | "page" | "admin" = "page") {
  const now = new Date().toISOString();
  await db().from("studio_settings").update(source === "cron" ? { last_tick_at: now, last_cron_tick_at: now } : { last_tick_at: now }).eq("id", 1);
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
      if (!(await profileById(b.profile_id)).reminder_emails) continue; // turned off in Account
      // Booked after this reminder would have gone out: the confirmation is enough.
      if (b.confirmed_at && new Date(b.confirmed_at).getTime() > start - offset * 60_000) continue;
      const [s, p] = await Promise.all([sessionInfo(b.session_id), profileById(b.profile_id)]);
      const template = offset <= 180 ? "reminder_2h" : "reminder_24h";
      await notify({ profileId: p.id, email: p.email, phone: p.phone }, template,
        { name: p.full_name ?? undefined, ...tmpl(s), when: offset <= 180 ? time(s.starts_at) : spokenDateTime(s.starts_at),
          note: s.type.kind === "event" ? undefined : "Remember your grip socks · arrive 5–10 minutes early." },
        { sms: offset <= 180, bookingId: b.id, sessionId: s.id, dedupeKey: `reminder:${offset}:${b.id}` });
      sent++;
    }
  }
  sent += await creditAndRenewalNotices();
  await db().rpc("extend_timetable", {}); // the timetable repeats by itself, ~9 weeks ahead
  // Demo only: Sofia always has her birthday today, so the cake and the birthday email can be tried.
  if (env.demoMode) await db().from("profiles").update({ date_of_birth: `1995-${todayKey().slice(5) === "02-29" ? "02-28" : todayKey().slice(5)}` }).eq("email", "sofia@example.com");
  const weekly = await applyRecurring();
  return { offers: (offers ?? []).length, reminders: sent, weekly: weekly.booked };
}

/** Expire credits; warn about expiring credits (7 days), low credits (1 left) and renewals (3 days). */
async function creditAndRenewalNotices() {
  await db().rpc("expire_credits");
  const cfg = await getSettings();
  let n = 0;
  const now = Date.now();
  const in7 = new Date(now + cfg.expiry_reminder_days * 86_400_000).toISOString();

  // Unpaid package requests expire (default 48h) and the client is told.
  const { data: expiredReqs } = await db().rpc("expire_unpaid_requests");
  for (const row of (expiredReqs ?? []) as unknown as (string | { expire_unpaid_requests: string })[]) {
    const id = typeof row === "string" ? row : row.expire_unpaid_requests;
    const { data: pay } = await db().from("payments").select("profile_id, description").eq("id", id).single();
    if (!pay?.profile_id) continue;
    const p = await profileById(pay.profile_id);
    await notify({ profileId: p.id, email: p.email }, "payment_request",
      { name: p.full_name ?? undefined, className: pay.description, note: `We didn't receive payment within ${cfg.unpaid_request_expiry_hours} hours, so this request has expired. You're welcome to request it again any time.` },
      { dedupeKey: `request-expired:${id}` });
    n++;
  }

  const { data: expiring } = await db().from("credit_lots").select("id, profile_id, credit_kind, remaining, expires_at, membership_id")
    .gt("remaining", 0).gt("expires_at", new Date(now).toISOString()).lte("expires_at", in7);
  for (const lot of expiring ?? []) {
    if (lot.membership_id) continue; // membership credits renew; the renewal notice covers them
    const p = await profileById(lot.profile_id);
    await notify({ profileId: p.id, email: p.email }, "credits_expiring",
      { name: p.full_name ?? undefined, note: `${lot.remaining} ${lot.credit_kind} class${lot.remaining === 1 ? "" : "es"} expire on ${spokenDateTime(lot.expires_at!).split(",")[0]}.` },
      { dedupeKey: `expiring:${lot.id}` });
    n++;
  }

  // Low credits: exactly 1 usable credit left of a kind (once per lot set).
  const { data: lots } = await db().from("credit_lots").select("id, profile_id, credit_kind, remaining").gt("remaining", 0)
    .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`);
  const totals = new Map<string, { sum: number; ids: string[] }>();
  for (const l of lots ?? []) {
    const k = `${l.profile_id}|${l.credit_kind}`;
    const t = totals.get(k) ?? { sum: 0, ids: [] };
    t.sum += l.remaining; t.ids.push(l.id); totals.set(k, t);
  }
  for (const [k, t] of totals) {
    if (t.sum !== 1) continue;
    const [profileId, kind] = k.split("|");
    const p = await profileById(profileId);
    await notify({ profileId: p.id, email: p.email }, "credits_low", { name: p.full_name ?? undefined, className: kind }, { dedupeKey: `low:${t.ids.sort().join(",")}` });
    n++;
  }

  // Renewal reminders 3 days ahead.
  const { data: due } = await db().from("memberships").select("id, profile_id, provider, current_period_end, cancel_at_period_end, products!memberships_product_id_fkey(name, price_cents)")
    .eq("status", "active").eq("cancel_at_period_end", false)
    .gt("current_period_end", new Date(now).toISOString()).lte("current_period_end", new Date(now + 3 * 86_400_000).toISOString());
  for (const m of due ?? []) {
    const p = await profileById(m.profile_id);
    await notify({ profileId: p.id, email: p.email }, "renewal_upcoming",
      { name: p.full_name ?? undefined, className: m.products?.name, when: spokenDateTime(m.current_period_end).split(",")[0],
        note: m.provider === "stripe" ? "It renews automatically; manage or cancel any time from your Membership page." : `Renew at the studio (${eur(m.products?.price_cents ?? 0)}, cash or card) to keep your classes coming.` },
      { dedupeKey: `renewal:${m.id}:${m.current_period_end}` });
    n++;
  }
  return n;
}
