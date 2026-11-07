import "server-only";
import { env, paymentsLive } from "@/lib/env";
import { mockProvider } from "./mock";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

/** Stripe when its keys are set; otherwise the test checkout, which exists only outside the real app (A-040). */
export function paymentProvider(): PaymentProvider {
  if (paymentsLive()) return stripeProvider;
  if (env.isProduction) throw new Error("Online payments aren't connected (no card payment keys).");
  return mockProvider;
}
