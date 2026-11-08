import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Bubbles } from "@/components/Bubbles";
import { ClassRow } from "@/components/ClassRow";
import { ButtonLink, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { availability, eventExtras, lockedEventIds, nextBooking, viewerSessionState } from "@/lib/data";
import { EventCard, LockedEvent } from "@/components/EventCard";
import { dayMonth, longDate, relativeHours, time, weekdayShort } from "@/lib/time";
import { CalendarPlus, Hourglass } from "lucide-react";
import { db } from "@/lib/supabase/admin";
import { getMedia, logoSrc } from "@/lib/media";
import { eur } from "@/lib/money";
import { scheduleTick } from "@/lib/tick";
import { after } from "next/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  scheduleTick();
  const now = new Date();
  // A-100: everything that needs only the viewer starts together with it (one stage, not three).
  const viewerP = getViewer();
  const withPid = async <T,>(f: (pid: string | undefined) => T | PromiseLike<T>): Promise<T> => f((await viewerP)?.profile.id);
  const [settings, viewer, classes, state, mine, logo, requested] = await Promise.all([
    getSettings(),
    viewerP,
    availability(now, new Date(now.getTime() + 21 * 86_400_000)),
    withPid((pid) => viewerSessionState(pid)),
    withPid((pid) => (pid ? nextBooking(pid) : null)),
    logoSrc(),
    withPid((pid) => (pid ? db().from("payments").select("id, description, amount_cents").eq("profile_id", pid).eq("status", "pending").eq("provider", "offline").is("booking_id", null).limit(1).maybeSingle().then((r) => r.data) : null)),
  ]);
  const open = classes.filter((c) => c.status === "scheduled");
  const next = open.filter((c) => c.kind !== "event" && c.spots_left > 0).slice(0, 3);
  const event = open.find((c) => c.kind === "event");
  // The next event, shown only when there is one; clients-only ones stay private (blurred, no details).
  const [eventLockedIds, eventExtrasMap, eventCovers] = event
    ? await Promise.all([lockedEventIds([event.id], viewer?.profile.id), eventExtras([event.id]), getMedia(`event-cover:${event.id}`)])
    : [new Set<string>(), new Map(), []];
  const eventLocked = !!event && eventLockedIds.has(event.id);
  const eventClientsOnly = !!event && !!eventExtrasMap.get(event.id)?.clients_only;
  const eventCover = eventCovers[0];
  const firstName = viewer?.profile.full_name?.split(" ")[0];
  // Her note (8 Nov): "Welcome, name" the first time a new client sees Home, "Welcome back, name" after that.
  const firstVisit = !!viewer && !viewer.profile.home_seen_at;
  if (firstVisit) after(async () => { await db().from("profiles").update({ home_seen_at: new Date().toISOString() }).eq("id", viewer.profile.id); });
  return (
    <div className="pb-4">
      <section className="lilac-wash relative overflow-hidden rounded-b-[36px] px-6 pb-9 pt-8 text-center">
        <div className="animate-rise mx-auto w-fit">
          <Logo size={136} src={logo} priority />
        </div>
        {/* Only her own words on Home (her note): a greeting for clients, her intro line for everyone. */}
        {firstName
          ? <h1 className="display mx-auto mt-5 max-w-xs animate-rise text-[1.25rem] text-ink [animation-delay:100ms]">{firstVisit ? "Welcome" : "Welcome back"}, {firstName}</h1>
          : <h1 className="sr-only">{settings.studio_name || "Re·Form Pilates Studio"}</h1>}
        <p className="mx-auto mt-3 max-w-sm animate-rise text-[0.95rem] leading-relaxed text-ink-soft [animation-delay:140ms]">{settings.intro_line}</p>
        <ButtonLink href="/packs" className="mt-6 w-full max-w-xs animate-rise [animation-delay:180ms]">
          Secure your package
        </ButtonLink>
      </section>

      {(mine || requested) && (
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
        </div>
      )}

      <div className="mt-6">
        <Bubbles />
      </div>

      {event && (
        <Section title="Upcoming event" className="mt-8">
          {eventLocked ? <LockedEvent cover={eventCover} signedIn={!!viewer} next="/" /> : (
            <Link href={`/book/${event.id}`} className="block rounded-[var(--radius-card)] shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)]">
              <EventCard e={event} cover={eventCover} booked={state.booked.has(event.id)} clientsOnly={eventClientsOnly} font={eventExtrasMap.get(event.id)?.title_font} />
            </Link>
          )}
        </Section>
      )}

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


    </div>
  );
}
