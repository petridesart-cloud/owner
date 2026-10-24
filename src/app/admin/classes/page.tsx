import Link from "next/link";
import { CalendarRange, CalendarX } from "lucide-react";
import { Badge, ButtonLink } from "@/components/ui";
import { DayStrip } from "@/components/DayStrip";
import { db } from "@/lib/supabase/admin";
import { addDaysKey, dayKey, localToUtc, longDate, time, todayKey } from "@/lib/time";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

// Two weeks back, eight weeks ahead: swipe the strip like the client Schedule.
const BACK = 14, AHEAD = 56;

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const today = todayKey();
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  // Centre on today; a day further away (e.g. from a link) gets its own window.
  const near = selected >= addDaysKey(today, -BACK) && selected < addDaysKey(today, AHEAD);
  const keys = Array.from({ length: BACK + AHEAD }, (_, i) => addDaysKey(near ? today : selected, i - BACK));

  const { data } = await db().from("class_sessions")
    .select("id, starts_at, capacity, status, title, class_types(name, kind), bookings!bookings_session_id_fkey(status), waitlist_entries(status)")
    .gte("starts_at", localToUtc(keys[0], "00:00")).lt("starts_at", localToUtc(addDaysKey(keys[keys.length - 1], 1), "00:00"))
    .order("starts_at");
  const sessions = data ?? [];
  const counts: Record<string, number> = {};
  for (const s of sessions) if (s.status === "scheduled") counts[dayKey(s.starts_at)] = (counts[dayKey(s.starts_at)] ?? 0) + 1;
  // Opened without a day: the first day from today that has classes.
  const shown = day ? selected : keys.find((k) => k >= today && counts[k]) ?? today;
  const list = sessions.filter((s) => dayKey(s.starts_at) === shown);

  return (
    <div>
      <AdminTitle title="Classes" sub="Tap a class to edit, add clients or cancel."
        action={<ButtonLink href="/admin/classes/new" className="min-h-11 px-4 text-[0.7rem]">New class</ButtonLink>} />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link href="/admin/timetable" className="card flex min-h-14 items-center gap-2.5 px-4 py-2"><CalendarRange aria-hidden size={18} className="shrink-0 text-plum-700" /><span className="font-medium text-ink">Monthly timetable</span></Link>
        <Link href="/admin/closures" className="card flex min-h-14 items-center gap-2.5 px-4 py-2"><CalendarX aria-hidden size={18} className="shrink-0 text-plum-700" /><span className="font-medium text-ink">Holidays &amp; closures</span></Link>
      </div>

      <div className="-mx-4"><DayStrip keys={keys} counts={counts} selected={shown} today={today} href="/admin/classes" className="top-[6.5rem]" /></div>

      <h2 className="display mb-2 mt-5 text-[0.95rem] text-ink">{longDate(`${shown}T12:00:00Z`)}</h2>
      {list.length ? (
        <ul className="card divide-y divide-line">
          {list.map((s) => {
            const booked = s.bookings.filter((b) => b.status === "confirmed" || b.status === "no_show").length;
            const waiting = s.waitlist_entries.filter((w) => w.status === "waiting" || w.status === "offered").length;
            const cancelled = s.status === "cancelled";
            return (
              <li key={s.id}>
                <Link href={`/admin/classes/${s.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-lilac-50">
                  <span className={cancelled ? "line-through opacity-60" : ""}>
                    <span className="font-serif text-xl text-ink">{time(s.starts_at)}</span>
                    <span className="ml-2 text-sm text-ink">{s.title ?? s.class_types?.name ?? "Class"}</span>
                  </span>
                  <span className="flex gap-1.5">
                    {waiting > 0 && <Badge tone="plain">+{waiting} waiting</Badge>}
                    {cancelled ? <Badge tone="full">Cancelled</Badge> : <Badge tone={booked >= s.capacity ? "mauve" : "lilac"}>{booked}/{s.capacity}</Badge>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card px-5 py-8 text-center text-ink-soft">No classes this day.</p>
      )}
    </div>
  );
}
