import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Bubbles } from "@/components/Bubbles";
import { ClassRow } from "@/components/ClassRow";
import { ButtonLink, Eyebrow, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { availability, viewerSessionState } from "@/lib/data";
import { longDate, time } from "@/lib/time";
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
