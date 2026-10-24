import "server-only";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getSettings, type Profile } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { paymentProvider } from "@/lib/payments";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { spokenDateTime, time, relativeHours } from "@/lib/time";
import { eur, vatPortion } from "@/lib/money";
import { applyRecurring } from "@/lib/recurring";

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
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

/** Trial or drop-in (or a paid event): reserve the spot, pay by cash or Revolut, the studio marks it paid. */
export async function bookSingle(profile: Profile, sessionId: string, mode: "trial" | "drop_in", method: "cash" | "revolut"): Promise<ActionResult<{ redirect: string }>> {
  const { data, error } = await db().rpc("book_session", { p_profile: profile.id, p_session: sessionId, p_mode: mode, p_method: method });
  if (error) return { ok: false, error: friendlyError(error) };
  const bookingId = (data as { booking_id: string }).booking_id;
  const s = await sessionInfo(sessionId);
  const { data: pay } = await db().from("payments").select("id, amount_cents").eq("booking_id", bookingId).single();
  const how = method === "revolut" ? "by Revolut" : "in cash at the studio";
  await notify({ profileId: profile.id, email: profile.email, phone: profile.phone }, "booking_confirmed",
    { name: profile.full_name ?? undefined, ...tmpl(s), note: `${mode === "trial" ? "Your trial class. " : ""}Please pay ${eur(pay?.amount_cents ?? s.price)} ${how} before class (reference ${paymentReference(pay!.id)}).` },
    { bookingId, sessionId });
  return { ok: true, data: { redirect: `/bookings/${bookingId}/confirmed` } };
}

/**
 * Buy a class pack or monthly package. With online payments off (default while the
 * studio isn't registered) this records a request to pay at the studio; the admin's
 * "Mark as paid" then grants the credits through the same ledger.
 */
export async function buyProduct(profile: Profile, productId: string, method: "cash" | "revolut" | "bank_transfer" = "cash"): Promise<ActionResult<{ redirect: string }>> {
  const { data: product } = await db().from("products").select("*").eq("id", productId).eq("active", true).single();
  if (!product) return { ok: false, error: "That package isn't available." };
  const cfg = await getSettings();
  const purpose = product.kind === "membership" ? "membership" : "pack";

  if (product.kind === "membership") {
    const { data: live } = await db().from("memberships").select("id").eq("profile_id", profile.id).in("status", ["active", "paused", "past_due"]).maybeSingle();
    if (live) return { ok: false, error: "You already have a monthly package. You can change it from your Membership page." };
  }

  const price = productPrice(product, profile, cfg);
  if (!cfg.online_payments_enabled) {
    const { data: existing } = await db().from("payments").select("id").eq("profile_id", profile.id).eq("product_id", product.id).eq("status", "pending").eq("provider", "offline").maybeSingle();
    if (existing) await db().from("payments").update({ intended_method: method }).eq("id", existing.id);
    if (!existing) {
      const { data: pay } = await db().from("payments").insert({
        profile_id: profile.id, provider: "offline", amount_cents: price.cents, purpose, product_id: product.id, intended_method: method,
        description: product.name, status: "pending", discount_note: price.student ? `Student ${cfg.student_discount_pct}%` : null,
      }).select("id").single();
      await notify({ profileId: profile.id, email: profile.email }, "payment_request",
        { name: profile.full_name ?? undefined, className: product.name, note: paymentInstructions(cfg, price.cents, paymentReference(pay!.id)) },
        { dedupeKey: `request:${pay!.id}` });
    }
    return { ok: true, data: { redirect: "/bookings?requested=1" } };
  }

  return product.kind === "membership" ? startSubscription(profile, product) : buyPack(profile, productId);
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

export async function buyPack(profile: Profile, productId: string): Promise<ActionResult<{ redirect: string }>> {
  const { data: product } = await db().from("products").select("*").eq("id", productId).eq("active", true).single();
  if (!product) return { ok: false, error: "That pack isn't available." };
  const cfg = await getSettings();
  const price = productPrice(product, profile, cfg);
  const { data: pay } = await db()
    .from("payments")
    .insert({
      profile_id: profile.id, provider: paymentProvider().name, amount_cents: price.cents,
      vat_cents: vatPortion(price.cents, Number(cfg.vat_rate), cfg.vat_registered),
      purpose: "pack", product_id: product.id, description: product.name, discount_note: price.student ? `Student ${cfg.student_discount_pct}%` : null,
    })
    .select("id")
    .single();
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
    await notify(to, "credits_added", { name: profile.full_name ?? undefined, note: `${pay.products.credits} ${pay.products.credit_kind} classes are in your account.` },
      { dedupeKey: `credits:${paymentId}` });
  }
  if (res.status !== "confirmed") await applyRecurring(profile.id);
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
      // Booked after this reminder would have gone out: the confirmation is enough.
      if (b.confirmed_at && new Date(b.confirmed_at).getTime() > start - offset * 60_000) continue;
      const [s, p] = await Promise.all([sessionInfo(b.session_id), profileById(b.profile_id)]);
      const template = offset <= 180 ? "reminder_2h" : "reminder_24h";
      await notify({ profileId: p.id, email: p.email, phone: p.phone }, template,
        { name: p.full_name ?? undefined, ...tmpl(s), when: offset <= 180 ? time(s.starts_at) : spokenDateTime(s.starts_at),
          note: `Remember your grip socks · arrive 5–10 minutes early. Need to cancel or reschedule? You can until ${cfg.cancellation_cutoff_hours}h before class.` },
        { sms: offset <= 180, bookingId: b.id, sessionId: s.id, dedupeKey: `reminder:${offset}:${b.id}` });
      sent++;
    }
  }
  sent += await creditAndRenewalNotices();
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
