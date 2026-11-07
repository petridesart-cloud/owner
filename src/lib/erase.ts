import "server-only";
import { db } from "@/lib/supabase/admin";
import { notifyOffers, type OfferRow } from "@/lib/booking";
import { later } from "@/lib/notifications";
import { personKeys } from "@/lib/rate-limit";

/**
 * Right to erasure (A-010, A-059): erase_profile first; the login is deleted only once that succeeded.
 * People moved up from the waitlist into the freed spots are told after the response.
 * Returns false when nothing was erased (the caller says so; nothing was removed).
 */
export async function eraseProfile(profileId: string, email: string | null): Promise<boolean> {
  const { data, error } = await db().rpc("erase_profile", { p_profile: profileId, p_rate_keys: personKeys(email, profileId) });
  if (error) {
    console.error("erase_profile failed", error);
    return false;
  }
  const res = (data ?? {}) as { user_id?: string | null; offers?: OfferRow[] };
  later("waitlist offers after erasure", () => notifyOffers(res.offers ?? []));
  if (res.user_id) await deleteLogin(res.user_id);
  return true;
}

/** The profile is already erased and unlinked, so a login left over can't reach anything; it's logged. */
export async function deleteLogin(userId: string) {
  const { error } = await db().auth.admin.deleteUser(userId);
  if (error) console.error("auth user delete failed (profile already erased)", userId, error);
}
