export type CheckoutRequest = {
  paymentId: string;          // our payments.id
  amountCents: number;
  description: string;        // what's being bought, shown on the provider page
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = { url: string; providerRef: string };

export type SubscriptionRequest = CheckoutRequest & {
  periodDays: number; calendarMonth: boolean; customerId?: string | null; profileId: string; productId: string;
};

/** A payment provider (Stripe today, Viva.com later). */
export interface PaymentProvider {
  readonly name: "stripe" | "viva" | "mock";
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Auto-renewing monthly package. Optional: providers without it fall back to one-off checkout. */
  createSubscriptionCheckout?(req: SubscriptionRequest): Promise<CheckoutResult>;
}
