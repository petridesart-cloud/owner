import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Bubbles } from "@/components/Bubbles";
import { ClassRow } from "@/components/ClassRow";
import { ButtonLink, Eyebrow, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { availability, creditBalance, nextBooking, usualSlot, viewerSessionState } from "@/lib/data";
import { RebookButton } from "./RebookButton";
import { dayMonth, longDate, relativeHours, time, weekdayLong, weekdayShort } from "@/lib/time";
import { CalendarPlus, Repeat } from "lucide-react";
import { eur } from "@/lib/money";
import { scheduleTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

export default async function Home() {
  scheduleTick();
  const now = new Date();
  const [settings, viewer, classes] = await Promise.all([
    getSettings(),
    getViewer(),
    availability(now, new Date(now.getTime() + 21 * 86_400_000)),
  ]);
  const state = await viewerSessionState(viewer?.profile.id);
  const open = classes.filter((c) => c.status === "scheduled");
  const next = open.filter((c) => c.kind !== "event" && c.spots_left > 0).slice(0, 3);
  const event = open.find((c) => c.kind === "event");
  const firstName = viewer?.profile.full_name?.split(" ")[0];
  const pid = viewer?.profile.id;
  const [mine, usual, credits] = pid
    ? await Promise.all([nextBooking(pid), usualSlot(pid, open, state.booked), creditBalance(pid)])
    : [null, null, null];
  const usualCredits = usual?.session.credit_kind && credits ? credits[usual.session.credit_kind] : 0;

  return (
    <div className="pb-4">
      <section className="lilac-wash relative overflow-hidden rounded-b-[36px] px-6 pb-9 pt-8 text-center">
        <div className="animate-rise mx-auto w-fit">
          <Logo size={132} />
        </div>
        <p className="eyebrow mt-5 animate-rise [animation-delay:60ms]">Pilates studio · Limassol, Cyprus</p>
        <h1 className="display mx-auto mt-3 max-w-xs animate-rise text-[1.7rem] text-ink [animation-delay:100ms]">
          {firstName ? <>Welcome back, <span className="font-script text-[2.1rem] normal-case tracking-normal text-plum-700">{firstName}</span></> : "Move well. Feel strong."}
        </h1>
        <p className="mx-auto mt-3 max-w-sm animate-rise text-[0.95rem] leading-relaxed text-ink-soft [animation-delay:140ms]">{settings.intro_line}</p>
        <ButtonLink href="/schedule" className="mt-6 w-full max-w-xs animate-rise [animation-delay:180ms]">
          Secure your spot
        </ButtonLink>
      </section>

      {(mine || usual) && (
        <div className="-mt-5 space-y-3 px-5">
          {mine && (
            <section aria-labelledby="next-class" className="card animate-rise flex items-center gap-4 px-4 py-4 [animation-delay:220ms]">
              <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-lilac-200 to-lilac-100 py-2 text-center">
                <span className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-ink-soft">{weekdayShort(mine.class_sessions.starts_at)}</span>
                <span className="font-serif text-[1.6rem] leading-none text-ink">{dayMonth(mine.class_sessions.starts_at).split(" ")[0]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow" id="next-class">Your next class · in {relativeHours(mine.class_sessions.starts_at)}</p>
                <p className="mt-1 truncate font-medium text-ink">{mine.class_sessions.title ?? mine.class_sessions.class_types?.name}</p>
                <p className="text-sm text-ink-soft">{time(mine.class_sessions.starts_at)} · {mine.class_sessions.location ?? mine.class_sessions.class_types?.default_location ?? "Re·Form Studio"}</p>
              </div>
              <a href={`/api/ics/${mine.id}`} aria-label="Add your next class to your calendar" className="grid size-11 shrink-0 place-items-center rounded-full bg-lilac-50 text-ink hover:bg-lilac-100">
                <CalendarPlus aria-hidden size={19} />
              </a>
            </section>
          )}
          {usual && (
            <section aria-labelledby="usual" className="card animate-rise px-4 py-4 [animation-delay:280ms]">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mauve-soft text-ink"><Repeat aria-hidden size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow" id="usual">Your usual</p>
                  <p className="mt-1 font-medium text-ink">{weekdayLong(usual.session.starts_at)}s at {time(usual.session.starts_at)}</p>
                  <p className="text-sm text-ink-soft">
                    {longDate(usual.session.starts_at)} · {usual.session.spots_left ? `${usual.session.spots_left} of ${usual.session.capacity} left` : "full, join the waitlist"}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {usual.session.spots_left > 0 && usualCredits > 0 ? (
                  <RebookButton sessionId={usual.session.id} label="Book again · 1 credit" />
                ) : (
                  <ButtonLink href={`/book/${usual.session.id}`} variant="soft" className="w-full">{usual.session.spots_left ? "Book again" : "Join waitlist"}</ButtonLink>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="mt-6">
        <Bubbles />
      </div>

      <Section
        title="Next available"
        className="mt-8"
        action={<Link href="/schedule" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink underline-offset-4 hover:underline">Full schedule <ArrowRight aria-hidden size={15} /></Link>}
      >
        {next.length ? (
          <ul className="space-y-2.5">
            {next.map((c) => (
              <li key={c.id}><ClassRow c={c} showDate state={state.booked.has(c.id) ? "booked" : state.waitlisted.get(c.id)} /></li>
            ))}
          </ul>
        ) : (
          <p className="card px-5 py-6 text-sm text-ink-soft">The new schedule is coming soon. Follow @{settings.instagram_handle} for updates.</p>
        )}
      </Section>

      {event && (
        <section className="mt-8 px-5" aria-labelledby="event-title">
          <Link href={`/book/${event.id}`} className="block overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#d9ecf3] via-lilac-100 to-mauve-soft p-6 shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)]">
            <Eyebrow>Special event</Eyebrow>
            <h2 id="event-title" className="mt-2 font-script text-[2.6rem] leading-none text-ink">{event.title}</h2>
            <p className="mt-3 text-sm font-medium text-ink">{longDate(event.starts_at)} · {time(event.starts_at)}</p>
            {event.location && <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin aria-hidden size={14} />{event.location}</p>}
            <p className="mt-4 inline-flex items-center gap-2 text-[0.78rem] font-medium uppercase tracking-[0.18em] text-ink">
              {event.spots_left ? `${event.spots_left} spots · ${eur(event.price_cents)}` : "Full · join waitlist"} <ArrowRight aria-hidden size={15} />
            </p>
          </Link>
        </section>
      )}

      <section className="mx-5 mt-8 rounded-[var(--radius-card)] bg-ink px-6 py-8 text-paper" aria-label="Daily motivation">
        <div className="flex justify-between text-[0.68rem] tracking-[0.22em] text-lilac-100" style={{ fontFamily: "var(--font-label)" }}>
          <span>DAILY MOTIVATION</span><span>{"// 001"}</span>
        </div>
        <p className="mt-10 max-w-[15rem] text-[1.05rem] font-semibold uppercase leading-snug tracking-wide">
          Your body deserves the time you give to everything else.
        </p>
      </section>
    </div>
  );
}
