import type { CheckoutRequest, PaymentProvider } from "./types";

// Demo provider used when no Stripe key is configured: a local "test payment" page.
export const mockProvider: PaymentProvider = {
  name: "mock",
  async createCheckout(req: CheckoutRequest) {
    const ref = `mock_${req.paymentId}`;
    return { url: `/checkout/mock?payment=${req.paymentId}`, providerRef: ref };
  },
};
