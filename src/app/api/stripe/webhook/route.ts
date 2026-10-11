import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/payments/stripe";
import { onPaymentPaid } from "@/lib/booking";
import { db } from "@/lib/supabase/admin";

// Stripe → confirms bookings / adds credits only after the payment succeeded.
export async function POST(req: Request) {
  if (!env.stripeSecret || !env.stripeWebhookSecret) return NextResponse.json({ error: "not configured" }, { status: 501 });
  const sig = req.headers.get("stripe-signature");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig ?? "", env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  const session = event.data.object as Stripe.Checkout.Session;
  const paymentId = session.metadata?.payment_id;
  if (!paymentId) return NextResponse.json({ ok: true });

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (session.payment_status === "paid") await onPaymentPaid(paymentId, session.id);
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const { data: pay } = await db().from("payments").update({ status: "failed" }).eq("id", paymentId).eq("status", "pending").select("booking_id, profile_id").maybeSingle();
    if (pay?.booking_id && pay.profile_id) await db().rpc("cancel_booking", { p_booking: pay.booking_id, p_profile: pay.profile_id });
  }
  return NextResponse.json({ ok: true });
}
