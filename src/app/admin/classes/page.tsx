import Link from "next/link";
import { Badge, ButtonLink } from "@/components/ui";
import { sessionsWithRoster } from "@/lib/admin-data";
import { addDaysKey, dayKey, localToUtc, longDate, time, todayKey } from "@/lib/time";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : todayKey();
  const sessions = await sessionsWithRoster(localToUtc(start, "00:00"), localToUtc(addDaysKey(start, 14), "00:00"));
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) byDay.set(dayKey(s.starts_at), [...(byDay.get(dayKey(s.starts_at)) ?? []), s]);

  return (
    <div>
      <AdminTitle title="Classes" sub="Next 14 days. Tap a class to edit, add clients or cancel."
        action={<ButtonLink href="/admin/classes/new" className="min-h-11 px-4 text-[0.7rem]">New class</ButtonLink>} />
      <div className="mb-4 flex gap-2">
        <Link href={`/admin/classes?from=${addDaysKey(start, -14)}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 text-sm">← Earlier</Link>
        <Link href={`/admin/classes?from=${addDaysKey(start, 14)}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 text-sm">Later →</Link>
      </div>
      {[...byDay.entries()].map(([k, list]) => (
        <section key={k} className="mb-5">
          <h2 className="display mb-2 text-[0.95rem] text-ink">{longDate(`${k}T12:00:00Z`)}</h2>
          <ul className="card divide-y divide-line">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/classes/${s.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-lilac-50">
                  <span className={s.status === "cancelled" ? "line-through opacity-60" : ""}>
                    <span className="font-serif text-xl text-ink">{time(s.starts_at)}</span>
                    <span className="ml-2 text-sm text-ink">{s.name}</span>
                  </span>
                  <span className="flex gap-1.5">
                    {s.waitlist.length > 0 && <Badge tone="plain">+{s.waitlist.length} waiting</Badge>}
                    {s.status === "cancelled" ? <Badge tone="full">Cancelled</Badge> : <Badge tone={s.roster.length >= s.capacity ? "mauve" : "lilac"}>{s.roster.length}/{s.capacity}</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {sessions.length === 0 && <p className="card px-5 py-8 text-center text-ink-soft">No classes in this period. Set up the month in Timetable.</p>}
    </div>
  );
}
