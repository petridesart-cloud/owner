import "server-only";
import { db } from "@/lib/supabase/admin";

export type Availability = {
  id: string; class_type_id: string; type_slug: string; type_name: string; kind: "reformer" | "mat" | "event";
  credit_kind: "reformer" | "mat" | null; title: string; description: string | null; starts_at: string; ends_at: string;
  capacity: number; spots_left: number; waitlist_count: number; price_cents: number; location: string | null;
  status: "scheduled" | "cancelled";
};

export async function availability(from: Date, to: Date): Promise<Availability[]> {
  const { data, error } = await db().rpc("session_availability", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw error;
  return (data ?? []) as Availability[];
}

/** The viewer's live bookings + waitlist entries, keyed by session id. */
export async function viewerSessionState(profileId: string | undefined) {
  const booked = new Set<string>();
  const waitlisted = new Map<string, "waiting" | "offered">();
  if (!profileId) return { booked, waitlisted };
  const [{ data: b }, { data: w }] = await Promise.all([
    db().from("bookings").select("session_id").eq("profile_id", profileId).in("status", ["confirmed"]),
    db().from("waitlist_entries").select("session_id, status").eq("profile_id", profileId).in("status", ["waiting", "offered"]),
  ]);
  b?.forEach((r) => booked.add(r.session_id));
  w?.forEach((r) => waitlisted.set(r.session_id, r.status as "waiting" | "offered"));
  return { booked, waitlisted };
}

export async function creditBalance(profileId: string) {
  const { data } = await db().rpc("credit_balance", { p_profile: profileId });
  const out = { reformer: 0, mat: 0, reformerExpiry: null as string | null, matExpiry: null as string | null };
  for (const r of data ?? []) {
    if (r.credit_kind === "reformer") { out.reformer = r.remaining; out.reformerExpiry = r.next_expiry; }
    if (r.credit_kind === "mat") { out.mat = r.remaining; out.matExpiry = r.next_expiry; }
  }
  return out;
}
