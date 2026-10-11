import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/payments/stripe";
import { onPaymentPaid } from "@/lib/booking";
import { notify } from "@/lib/notifications";
import { db } from "@/lib/supabase/admin";

// Stripe → confirms bookings, grants pack credits and membership periods only after
// money has moved. Verified by signature; idempotent per event id (processed_webhooks)
// and per period (credit_lots unique on membership + period start).
export async function POST(req: Request) {
  if (!env.stripeSecret || !env.stripeWebhookSecret) return NextResponse.json({ error: "not configured" }, { status: 501 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  const { error: dupe } = await db().from("processed_webhooks").insert({ id: event.id });
  if (dupe) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await handle(event);
  } catch (e) {
    // Let Stripe retry: forget the event so the retry is processed.
    await db().from("processed_webhooks").delete().eq("id", event.id);
    console.error("stripe webhook failed", event.type, e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.payment_id;
      if (!paymentId || session.payment_status !== "paid") return;
      const { data: pay } = await db().from("payments").select("profile_id").eq("id", paymentId).single();
      if (pay?.profile_id && typeof session.customer === "string") {
        await db().from("profiles").update({ stripe_customer_id: session.customer }).eq("id", pay.profile_id).is("stripe_customer_id", null);
      }
      await onPaymentPaid(paymentId, session.id);
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        const { data: p } = await db().from("payments").select("membership_id").eq("id", paymentId).single();
        if (p?.membership_id) await db().from("memberships").update({ provider: "stripe", provider_subscription_id: session.subscription }).eq("id", p.membership_id);
      }
      return;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.payment_id;
      if (!paymentId) return;
      const { data: pay } = await db().from("payments").update({ status: "failed" }).eq("id", paymentId).eq("status", "pending").select("booking_id, profile_id").maybeSingle();
      if (pay?.booking_id && pay.profile_id) await db().rpc("cancel_booking", { p_booking: pay.booking_id, p_profile: pay.profile_id });
      return;
    }
    case "invoice.paid": {
      // Renewals only; the first invoice is handled by checkout.session.completed.
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== "subscription_cycle") return;
      const subId = subscriptionId(invoice);
      const { data: m } = await db().from("memberships").select("id, profile_id, product_id, next_product_id").eq("provider_subscription_id", subId ?? "").maybeSingle();
      if (!m) return;
      const { data: pay } = await db().from("payments").upsert({
        profile_id: m.profile_id, provider: "stripe", provider_ref: invoice.id, amount_cents: invoice.amount_paid, purpose: "renewal",
        membership_id: m.id, product_id: m.next_product_id ?? m.product_id, description: "Monthly package renewal", status: "pending",
      }, { onConflict: "provider,provider_ref", ignoreDuplicates: false }).select("id").single();
      if (pay) await onPaymentPaid(pay.id, invoice.id);
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const { data: m } = await db().from("memberships").update({ status: "past_due" }).eq("provider_subscription_id", subscriptionId(invoice) ?? "")
        .select("profile_id, products!memberships_product_id_fkey(name)").maybeSingle();
      if (!m) return;
      const { data: p } = await db().from("profiles").select("*").eq("id", m.profile_id).single();
      if (p) await notify({ profileId: p.id, email: p.email }, "payment_failed", { name: p.full_name ?? undefined, className: m.products?.name }, { dedupeKey: `failed:${invoice.id}` });
      return;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await db().from("memberships").update({ cancel_at_period_end: sub.cancel_at_period_end }).eq("provider_subscription_id", sub.id);
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db().from("memberships").update({ status: "cancelled" }).eq("provider_subscription_id", sub.id);
      return;
    }
  }
}

function subscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string } }; subscription?: string });
  return parent.parent?.subscription_details?.subscription ?? parent.subscription ?? null;
}
