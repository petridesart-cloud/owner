"use server";
import { getViewer } from "@/lib/auth";
import { buyProduct } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";
import { TOO_MANY, bookingLimited } from "@/lib/rate-limit";

const METHODS = ["cash", "revolut", "bank_transfer"] as const;
export type PayMethod = (typeof METHODS)[number];

export async function buyPackAction(productId: string, acceptedTerms: boolean, method: PayMethod = "cash"): Promise<ActionResult<{ redirect: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: true, data: { redirect: "/login?next=/packs" } };
  if (!viewer.profile.onboarded_at) return { ok: true, data: { redirect: "/welcome?next=/packs" } };
  if (!viewer.profile.date_of_birth) return { ok: true, data: { redirect: "/account?dob=1" } };
  if (!viewer.profile.parq_completed_at) return { ok: true, data: { redirect: "/health?next=/packs" } };
  if (await bookingLimited(viewer.profile.id)) return { ok: false, error: TOO_MANY };
  if (!acceptedTerms) return { ok: false, error: "Please accept the package terms first." };
  if (!METHODS.includes(method)) return { ok: false, error: "Please choose how you'll pay." };
  return buyProduct(viewer.profile, productId, method);
}
