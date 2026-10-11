import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import type { CheckoutRequest, PaymentProvider } from "./types";

let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(env.stripeSecret!));

// Stripe-hosted Checkout: card data never touches our servers. Apple Pay and
// Google Pay appear automatically once enabled in the Stripe dashboard.
export const stripeProvider: PaymentProvider = {
  name: "stripe",
  async createCheckout(req: CheckoutRequest) {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: req.amountCents, product_data: { name: req.description } } }],
      customer_email: req.customerEmail ?? undefined,
      client_reference_id: req.paymentId,
      metadata: { payment_id: req.paymentId },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    return { url: session.url!, providerRef: session.id };
  },
};
