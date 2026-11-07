"use server";
import { getViewer } from "@/lib/auth";
import { buyProduct } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";
import { TOO_MANY, bookingLimited, rateLimited } from "@/lib/rate-limit";
import { findCode } from "@/lib/rewards";
import type { Discount } from "@/lib/discount";
import { safeNext } from "@/lib/safe-next";
import { parse, uuid } from "@/lib/validate";

const METHODS = ["cash", "revolut", "bank_transfer"] as const;
export type PayMethod = (typeof METHODS)[number];

export async function buyPackAction(productId: string, acceptedTerms: boolean, method: PayMethod = "cash", code: string | null = null, back: string | null = null): Promise<ActionResult<{ redirect: string }>> {
  // Where they were (this tab, this package chosen): every detour brings them back there (A-026).
  const ok = parse(uuid, productId);
  if (!ok.ok) return ok;
  const here = safeNext(back, "/packs");
  const next = encodeURIComponent(here);
  const viewer = await getViewer();
  if (!viewer) return { ok: true, data: { redirect: `/login?next=${next}&why=package` } };
  if (!viewer.profile.onboarded_at) return { ok: true, data: { redirect: `/welcome?next=${next}` } };
  if (!viewer.profile.date_of_birth) return { ok: true, data: { redirect: `/account?dob=1&next=${next}` } };
  if (!viewer.profile.parq_completed_at) return { ok: true, data: { redirect: `/health?next=${next}` } };
  if (await bookingLimited(viewer.profile.id)) return { ok: false, error: TOO_MANY };
  if (!acceptedTerms) return { ok: false, error: "Please accept the package terms first." };
  if (!METHODS.includes(method)) return { ok: false, error: "Please choose how you'll pay." };
  return buyProduct(viewer.profile, productId, method, typeof code === "string" ? code.slice(0, 40) : null);
}

/** "Have a code?": checks it and returns what it gives, so the prices can show it. The real price is worked out again on request. */
export async function checkCodeAction(code: string): Promise<ActionResult<Discount>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in first." };
  if (await rateLimited("code_check", viewer.profile.id, 10, 15)) return { ok: false, error: TOO_MANY };
  const found = await findCode(viewer.profile.id, String(code ?? "").slice(0, 40), undefined, "package");
  if (!found.ok) return found;
  const { id: _id, ...discount } = found.discount;
  void _id;
  return { ok: true, data: discount };
}
