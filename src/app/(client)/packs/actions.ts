"use server";
import { getViewer } from "@/lib/auth";
import { buyPack } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";

export async function buyPackAction(productId: string): Promise<ActionResult<{ redirect: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: true, data: { redirect: "/login?next=/packs" } };
  if (!viewer.profile.onboarded_at) return { ok: true, data: { redirect: "/welcome?next=/packs" } };
  return buyPack(viewer.profile, productId);
}
