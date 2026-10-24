import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Bubbles } from "@/components/Bubbles";
import { ClassRow } from "@/components/ClassRow";
import { ButtonLink, Eyebrow, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { availability, creditBalance, nextBooking, viewerSessionState } from "@/lib/data";
import { dayMonth, longDate, relativeHours, time, weekdayShort } from "@/lib/time";
import { CalendarPlus, CalendarRange, Hourglass, Repeat } from "lucide-react";
import { db } from "@/lib/supabase/admin";
import { getMedia, logoSrc } from "@/lib/media";
import { recurringSummary } from "@/lib/recurring";
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
  const [mine, credits, weekly, logo, studioPics, eventPics, requested] = await Promise.all([
    pid ? nextBooking(pid) : null,
    pid ? creditBalance(pid) : null,
    pid ? recurringSummary(pid) : [],
    logoSrc(),
    getMedia("studio:"),
    getMedia("event:"),
    pid ? db().from("payments").select("id, description, amount_cents").eq("profile_id", pid).eq("status", "pending").eq("provider", "offline").is("booking_id", null).limit(1).maybeSingle().then((r) => r.data) : null,
  ]);
  const hasPackage = !!credits && credits.reformer + credits.mat > 0;

  return (
    <div className="pb-4">
      <section className="lilac-wash relative overflow-hidden rounded-b-[36px] px-6 pb-9 pt-8 text-center">
        <div className="animate-rise mx-auto w-fit">
          <Logo size={136} src={logo} priority />
        </div>
        <h1 className="display mx-auto mt-5 max-w-xs animate-rise text-[1.7rem] text-ink [animation-delay:100ms]">
          {firstName ? <>Welcome back, <span className="font-script text-[2.1rem] normal-case tracking-normal text-plum-700">{firstName}</span></> : "Move well. Feel strong."}
        </h1>
        <p className="mx-auto mt-3 max-w-sm animate-rise text-[0.95rem] leading-relaxed text-ink-soft [animation-delay:140ms]">{settings.intro_line}</p>
        <ButtonLink href="/packs" className="mt-6 w-full max-w-xs animate-rise [animation-delay:180ms]">
          Secure your package
        </ButtonLink>
      </section>

      {(mine || hasPackage || requested) && (
        <div className="-mt-5 space-y-3 px-5">
          {requested && (
            <Link href="/bookings" className="card animate-rise flex items-center gap-4 px-4 py-4 [animation-delay:200ms]">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mauve-soft text-ink"><Hourglass aria-hidden size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow block">Awaiting payment</span>
                <span className="mt-1 block truncate font-medium text-ink">{requested.description} · {eur(requested.amount_cents)}</span>
                <span className="block text-sm text-ink-soft">Your classes appear as soon as it&apos;s paid.</span>
              </span>
              <ArrowRight aria-hidden size={17} className="shrink-0 text-ink-soft" />
            </Link>
          )}
          {mine && (
            <section aria-labelledby="next-class" className="card animate-rise flex items-center gap-4 px-4 py-4 [animation-delay:220ms]">
              <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-lilac-200 to-lilac-100 py-2 text-center">
                <span className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-ink-soft">{weekdayShort(mine.class_sessions.starts_at)}</span>
                <span className="font-serif text-[1.6rem] leading-none text-ink">{dayMonth(mine.class_sessions.starts_at).split(" ")[0]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow" id="next-class">Your next class · in {relativeHours(mine.class_sessions.starts_at)}</p>
                <p className="mt-1 truncate font-medium text-ink">{mine.class_sessions.title ?? mine.class_sessions.class_types?.name}</p>
                <p className="text-sm text-ink-soft">{longDate(mine.class_sessions.starts_at).split(" ").slice(0, 3).join(" ")} · {time(mine.class_sessions.starts_at)}</p>
              </div>
              <a href={`/api/ics/${mine.id}`} aria-label="Add your next class to your calendar" className="grid size-11 shrink-0 place-items-center rounded-full bg-lilac-50 text-ink hover:bg-lilac-100">
                <CalendarPlus aria-hidden size={19} />
              </a>
            </section>
          )}
          {hasPackage && (
            <section aria-labelledby="how-to-book" className="card animate-rise px-4 py-4 [animation-delay:280ms]">
              <h2 className="eyebrow" id="how-to-book">Book your classes</h2>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Link href="/schedule" className="pressable flex flex-col gap-1.5 rounded-2xl bg-lilac-50 px-3.5 py-3 text-ink hover:bg-lilac-100">
                  <CalendarRange aria-hidden size={19} />
                  <span className="text-sm font-medium">Pick classes</span>
                  <span className="text-xs text-ink-soft">One by one</span>
                </Link>
                <Link href="/bookings/weekly" className="pressable flex flex-col gap-1.5 rounded-2xl bg-lilac-50 px-3.5 py-3 text-ink hover:bg-lilac-100">
                  <Repeat aria-hidden size={19} />
                  <span className="text-sm font-medium">Every week</span>
                  <span className="text-xs text-ink-soft">{weekly.length ? weekly.join(" · ") : "Same days & times"}</span>
                </Link>
              </div>
            </section>
          )}
        </div>
      )}

      <div className="mt-6">
        <Bubbles covers={{ studio: studioPics[0]?.url, events: eventPics[0]?.url }} />
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

    </div>
  );
}
