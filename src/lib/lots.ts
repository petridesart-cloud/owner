/**
 * A-064: one definition of a "current" package for the client's My classes and the studio's client page:
 * not expired, and either classes left or a booked class still to come (SQL's lot_usable_for / is_studio_client
 * decide who may book and who counts as a client; this only decides which package cards are shown as current).
 */
export function lotIsCurrent(lot: { remaining: number; expires_at: string | null }, hasUpcoming: boolean, nowMs: number) {
  const expired = !!lot.expires_at && new Date(lot.expires_at).getTime() <= nowMs;
  return !expired && (lot.remaining > 0 || hasUpcoming);
}
