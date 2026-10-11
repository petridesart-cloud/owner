import { NextResponse } from "next/server";
import { env, paymentsLive } from "@/lib/env";
import { getViewer } from "@/lib/auth";
import { stripe } from "@/lib/payments/stripe";

// Stripe Customer Portal: update card or cancel renewal in two taps.
export async function POST() {
  const viewer = await getViewer();
  if (!viewer || !paymentsLive() || !viewer.profile.stripe_customer_id) return NextResponse.redirect(`${env.siteUrl}/membership`, 303);
  const session = await stripe().billingPortal.sessions.create({ customer: viewer.profile.stripe_customer_id, return_url: `${env.siteUrl}/membership` });
  return NextResponse.redirect(session.url, 303);
}
