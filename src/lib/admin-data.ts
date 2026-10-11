import "server-only";
import { db } from "@/lib/supabase/admin";

export type RosterSession = Awaited<ReturnType<typeof sessionsWithRoster>>[number];

/** Sessions in a time range with their confirmed roster and waitlist (admin only). */
export async function sessionsWithRoster(from: string, to: string) {
  const { data } = await db()
    .from("class_sessions")
    .select("id, starts_at, ends_at, capacity, status, title, location, class_types(name, kind), bookings(id, status, paid_with, source, checked_in_at, profiles(id, full_name, phone, health_notes(note))), waitlist_entries(id, status, created_at, profiles(id, full_name))")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");
  return (data ?? []).map((s) => ({
    ...s,
    name: s.title ?? s.class_types?.name ?? "Class",
    roster: s.bookings.filter((b) => b.status === "confirmed" || b.status === "no_show"),
    waitlist: s.waitlist_entries.filter((w) => w.status === "waiting" || w.status === "offered").sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}
