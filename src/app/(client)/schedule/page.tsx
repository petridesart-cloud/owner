import type { Metadata } from "next";
import Link from "next/link";
import { ClassRow } from "@/components/ClassRow";
import { stateColors } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { availability, lockedEvents, viewerSessionState } from "@/lib/data";
import { addDaysKey, dayKey, keyToDate, longDate, monthYear, todayKey, weekdayShort } from "@/lib/time";
import { scheduleTick } from "@/lib/tick";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";


export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  scheduleTick();
  const { day } = await searchParams;
  const today = todayKey();
  const now = new Date();
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);
  const DAYS = settings.booking_window_days;
  const keys = Array.from({ length: DAYS }, (_, i) => addDaysKey(today, i));
  const classes = await availability(now, new Date(now.getTime() + DAYS * 86_400_000));
  const state = await viewerSessionState(viewer?.profile.id);
  const locked = await lockedEvents(classes, viewer?.profile.id, state.booked);

  const byDay = new Map<string, typeof classes>();
  for (const c of classes) {
    const k = dayKey(c.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), c]);
  }
  const firstWithClasses = keys.find((k) => byDay.get(k)?.some((c) => c.status === "scheduled")) ?? today;
  const selected = day && keys.includes(day) ? day : firstWithClasses;
  const list = byDay.get(selected) ?? [];

  return (
    <div>
      <header className="animate-rise px-5 pb-4 pt-6">
        <h1 className="display text-[1.9rem] text-ink">Schedule</h1>
        <p className="mt-1 font-serif text-[1.7rem] leading-tight text-plum-700">{monthYear(keyToDate(selected))}</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
          Book up to {Math.round(DAYS / 7)} weeks ahead. Cancel free of charge up to {settings.cancellation_cutoff_hours} hours before class.
        </p>
        <ul aria-label="Colour key" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          <li className="flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-full ${stateColors.booked}`} />Booked</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-full ${stateColors.open}`} />Spots available</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-full border border-mauve/50 ${stateColors.waitlist}`} />Full · waitlist</li>
        </ul>
      </header>

      <nav aria-label="Choose a day" className="glass sticky top-14 z-20 border-y border-line/60 py-2.5">
        <ul className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-5">
          {keys.map((k) => {
            const dt = keyToDate(k);
            const count = byDay.get(k)?.filter((c) => c.status === "scheduled").length ?? 0;
            const active = k === selected;
            return (
              <li key={k} className="snap-start">
                <Link
                  href={`/schedule?day=${k}`}
                  scroll={false}
                  aria-current={active ? "date" : undefined}
                  aria-label={`${longDate(dt)}${count ? `, ${count} classes` : ", no classes"}`}
                  className={`flex h-[68px] w-[52px] flex-col items-center justify-center rounded-2xl border transition ${
                    active ? "border-ink bg-ink text-paper shadow-[var(--shadow-lift)]" : count ? "border-line bg-white/80 text-ink hover:border-lilac-300" : "border-transparent text-ink-soft"
                  }`}
                >
                  <span className="text-[0.66rem] font-medium uppercase tracking-[0.12em]">{k === today ? "Today" : weekdayShort(dt)}</span>
                  <span className="mt-0.5 font-serif text-[1.45rem] leading-none">{Number(k.slice(8))}</span>
                  <span aria-hidden className={`mt-1 size-1 rounded-full ${count ? (active ? "bg-lilac-200" : "bg-lilac-300") : "bg-transparent"}`} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="day-heading" className="px-5 pt-5">
        <h2 id="day-heading" className="display mb-3 text-[1.05rem] text-ink">{longDate(keyToDate(selected))}</h2>
        {list.length ? (
          <ul className="space-y-2.5">
            {list.map((c, i) => (
              <li key={c.id} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
                <ClassRow c={c} state={state.booked.has(c.id) ? "booked" : state.waitlisted.get(c.id)} locked={locked.has(c.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="card px-5 py-8 text-center">
            <p className="font-serif text-xl text-ink">No classes this day</p>
            <p className="mt-1 text-sm text-ink-soft">Rest is part of the practice. Pick another day above.</p>
          </div>
        )}
      </section>
    </div>
  );
}
