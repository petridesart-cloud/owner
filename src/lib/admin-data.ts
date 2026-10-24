import "server-only";
import { db } from "@/lib/supabase/admin";
import { ageOn } from "@/lib/profile";
import { dayKey } from "@/lib/time";

export type RosterSession = Awaited<ReturnType<typeof sessionsWithRoster>>[number];

/** Sessions in a time range with their confirmed roster and waitlist (admin only). */
export async function sessionsWithRoster(from: string, to: string) {
  const { data } = await db()
    .from("class_sessions")
    .select("id, starts_at, ends_at, capacity, status, title, location, class_types(name, kind), bookings(id, status, paid_with, source, checked_in_at, payment:payments!bookings_payment_id_fkey(status, intended_method, products(tag)), profiles(id, full_name, phone, photo_consent, date_of_birth, health_notes(note, injuries, medication))), waitlist_entries(id, status, created_at, profiles(id, full_name))")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");
  const rows = data ?? [];
  // First class ever: no earlier attended/booked class for that client.
  const ids = [...new Set(rows.flatMap((s) => s.bookings.map((b) => b.profiles?.id)).filter(Boolean))] as string[];
  const first = new Map<string, string>();
  if (ids.length) {
    const { data: prior } = await db().from("bookings").select("profile_id, class_sessions!inner(starts_at)")
      .in("profile_id", ids).in("status", ["confirmed", "no_show", "late_cancelled"]);
    for (const b of prior ?? []) {
      const cur = first.get(b.profile_id);
      if (!cur || b.class_sessions.starts_at < cur) first.set(b.profile_id, b.class_sessions.starts_at);
    }
  }
  return rows.map((s) => ({
    ...s,
    name: s.title ?? s.class_types?.name ?? "Class",
    roster: s.bookings.filter((b) => b.status === "confirmed" || b.status === "no_show").map((b) => ({
      ...b,
      firstClass: !!b.profiles && first.get(b.profiles.id) === s.starts_at,
      // On the class day (studio time): birthday, and under-18s (parental consent).
      birthday: !!b.profiles?.date_of_birth && b.profiles.date_of_birth.slice(5) === dayKey(s.starts_at).slice(5),
      minor: !!b.profiles?.date_of_birth && ageOn(b.profiles.date_of_birth, dayKey(s.starts_at)) < 18,
      tag: b.payment?.products?.tag as "trial" | "drop_in" | undefined,
    })),
    waitlist: s.waitlist_entries.filter((w) => w.status === "waiting" || w.status === "offered").sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}
