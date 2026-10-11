import type { PaymentProvider } from "./types";

// Viva.com (Viva Wallet) Smart Checkout — planned. Implementation outline:
//  1. POST https://api.vivapayments.com/checkout/v2/orders (OAuth client credentials)
//     with amount, customerTrns = description, merchantTrns = paymentId.
//  2. Redirect to https://www.vivapayments.com/web/checkout?ref={orderCode}.
//  3. Webhook "Transaction Payment Created" → confirm_payment(paymentId).
export const vivaProvider: PaymentProvider = {
  name: "viva",
  async createCheckout() {
    throw new Error("Viva.com is not configured yet");
  },
};
