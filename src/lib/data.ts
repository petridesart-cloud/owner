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

export type EventExtras = { clients_only: boolean; what_to_bring: string | null; event_policy: string | null; recap: string | null };

/** Her per-event options (clients only, what to bring, own terms), keyed by session id. */
export async function eventExtras(ids: string[]): Promise<Map<string, EventExtras>> {
  if (!ids.length) return new Map();
  const { data } = await db().from("class_sessions").select("id, clients_only, what_to_bring, event_policy, recap").in("id", ids);
  return new Map((data ?? []).map(({ id, ...x }) => [id, x]));
}

/** Which of these clients-only events this person may NOT open (no active package, not added by the studio, not booked). */
export async function lockedEventIds(ids: string[], profileId: string | undefined): Promise<Set<string>> {
  const extras = await eventExtras(ids);
  const only = ids.filter((id) => extras.get(id)?.clients_only);
  if (!only.length) return new Set();
  if (!profileId) return new Set(only);
  const checks = await Promise.all(only.map((id) => db().rpc("can_access_event", { p_profile: profileId, p_session: id })));
  return new Set(only.filter((_, i) => checks[i].data !== true));
}

/** Clients-only events in a list that this viewer can't open. */
export async function lockedEvents(classes: Availability[], profileId: string | undefined) {
  return lockedEventIds(classes.filter((c) => c.kind === "event").map((c) => c.id), profileId);
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

/** The viewer's next confirmed class, if any. */
export async function nextBooking(profileId: string) {
  const { data } = await db().from("bookings")
    .select("id, class_sessions!inner(id, starts_at, ends_at, title, location, status, class_types(name, kind, default_location))")
    .eq("profile_id", profileId).eq("status", "confirmed")
    .gt("class_sessions.starts_at", new Date().toISOString())
    .order("starts_at", { referencedTable: "class_sessions", ascending: true })
    .limit(10);
  const rows = (data ?? []).sort((a, b) => a.class_sessions.starts_at.localeCompare(b.class_sessions.starts_at));
  return rows[0] ?? null;
}

/**
 * "Your usual": the weekday + time + class type the client has booked most often
 * (at least twice), and the next bookable class in that slot.
 */
export async function usualSlot(profileId: string, upcoming: Availability[], booked: Set<string>) {
  const { data } = await db().from("bookings")
    .select("class_sessions!inner(starts_at, class_type_id)")
    .eq("profile_id", profileId).in("status", ["confirmed", "no_show"])
    .gte("class_sessions.starts_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .lt("class_sessions.starts_at", new Date().toISOString());
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const key = `${r.class_sessions.class_type_id}|${fmt.format(new Date(r.class_sessions.starts_at))}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (!best) return null;
  const [typeId, slot] = best[0].split("|");
  const next = upcoming.find((c) => c.class_type_id === typeId && c.status === "scheduled" && fmt.format(new Date(c.starts_at)) === slot && !booked.has(c.id));
  return next ? { session: next, times: best[1] } : null;
}
