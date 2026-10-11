import "server-only";
import { paymentsLive } from "@/lib/env";
import { mockProvider } from "./mock";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export function paymentProvider(): PaymentProvider {
  return paymentsLive() ? stripeProvider : mockProvider;
}
