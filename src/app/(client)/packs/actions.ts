"use server";
import { getViewer } from "@/lib/auth";
import { buyProduct } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";

export async function buyPackAction(productId: string, acceptedTerms: boolean): Promise<ActionResult<{ redirect: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: true, data: { redirect: "/login?next=/packs" } };
  if (!viewer.profile.onboarded_at) return { ok: true, data: { redirect: "/welcome?next=/packs" } };
  if (!acceptedTerms) return { ok: false, error: "Please accept the package terms first." };
  return buyProduct(viewer.profile, productId);
}
