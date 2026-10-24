import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, MapPin } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { PhotoStrip } from "@/components/PhotoStrip";
import { Badge, Card, Eyebrow, PageTitle, Section } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { getTexts } from "@/lib/content";
import { availability, eventExtras, lockedEventIds, viewerSessionState, type Availability } from "@/lib/data";
import { getMedia, type MediaItem } from "@/lib/media";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { longDate, time } from "@/lib/time";

export const metadata: Metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const now = new Date();
  const [viewer, texts, upcomingAll, photos, covers, { data: past }] = await Promise.all([
    getViewer(),
    getTexts(),
    availability(now, new Date(now.getTime() + 365 * 86_400_000)),
    getMedia("event:"),
    getMedia("event-cover:"),
    db().from("class_sessions").select("id, title, recap, starts_at, location, class_types!inner(kind)")
      .eq("class_types.kind", "event").eq("status", "scheduled").lt("starts_at", now.toISOString())
      .order("starts_at", { ascending: false }).limit(12),
  ]);
  const upcoming = upcomingAll.filter((c) => c.kind === "event" && c.status === "scheduled");
  const [state, extras, lockedIds] = await Promise.all([
    viewerSessionState(viewer?.profile.id),
    eventExtras(upcoming.map((e) => e.id)),
    lockedEventIds(upcoming.map((e) => e.id), viewer?.profile.id),
  ]);
  // The archive shows the events she has added photos or a few words to.
  const archive = (past ?? []).filter((e) => e.recap || photos.some((p) => p.slot === `event:${e.id}`));

  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Events">{texts.events_intro || undefined}</PageTitle>

      <Section title="Upcoming events">
        {upcoming.length ? (
          <ul className="space-y-3">
            {upcoming.map((e) => {
              const cover = covers.find((p) => p.slot === `event-cover:${e.id}`);
              const locked = lockedIds.has(e.id);
              return (
                <li key={e.id}>
                  {locked ? <LockedEvent cover={cover} signedIn={!!viewer} /> : (
                    <Link href={`/book/${e.id}`} className="block rounded-[var(--radius-card)] shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)]">
                      <EventCard e={e} cover={cover} clientsOnly={!!extras.get(e.id)?.clients_only} booked={state.booked.has(e.id)} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Card className="px-5 py-6 text-sm text-ink-soft">New events are announced on Instagram first. Check back soon.</Card>
        )}
      </Section>

      {archive.length > 0 && (
        <Section title="Previous events" className="mt-10">
          <ul className="-mx-5 space-y-8">
            {archive.map((e) => (
              <li key={e.id}>
                <div className="mb-3 px-5">
                  <p className="font-medium text-ink">{e.title}</p>
                  <p className="flex items-center gap-1.5 text-sm text-ink-soft">{longDate(e.starts_at)}{e.location && <><span aria-hidden>·</span><MapPin aria-hidden size={13} />{e.location}</>}</p>
                </div>
                {photos.some((p) => p.slot === `event:${e.id}`) && <PhotoStrip photos={photos.filter((p) => p.slot === `event:${e.id}`)} label={e.title ?? "Event"} slides />}
                {e.recap && <p className="mt-3 px-5 text-[0.95rem] leading-relaxed text-ink-soft">{e.recap}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** Her background picture (or the soft gradient), with the details on a frosted panel so the text stays readable. */
function EventCard({ e, cover, booked, clientsOnly }: { e: Availability; cover?: MediaItem; booked: boolean; clientsOnly: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#d9ecf3] via-lilac-100 to-mauve-soft">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cover && <img src={cover.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
      <div className={`relative p-6 ${cover ? "pt-36" : ""}`}>
        <div className={cover ? "-mx-3 -mb-3 rounded-[18px] bg-white/85 p-4 backdrop-blur-md" : ""}>
          <Eyebrow>{longDate(e.starts_at)} · {time(e.starts_at)}</Eyebrow>
          <h3 className="mt-2 font-script text-[2.4rem] leading-none text-ink">{e.title}</h3>
          {e.description && <p className="mt-3 text-sm leading-relaxed text-ink">{e.description}</p>}
          {e.location && <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin aria-hidden size={14} />{e.location}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {booked ? <Badge tone="booked">You&apos;re booked</Badge>
              : e.spots_left ? <Badge tone="open">{e.spots_left} of {e.capacity} spots left · {eur(e.price_cents)}</Badge>
              : <Badge tone="waitlist">Full · Join waitlist</Badge>}
            {clientsOnly && <Badge tone="plain">Clients only</Badge>}
            <ArrowRight aria-hidden size={17} className="ml-auto text-ink" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Clients-only event for someone who can't see it: blurred, no details on the page at all, nothing to tap. */
function LockedEvent({ cover, signedIn }: { cover?: MediaItem; signedIn: boolean }) {
  return (
    <div className="relative h-56 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#d9ecf3] via-lilac-100 to-mauve-soft shadow-[var(--shadow-soft)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cover && <img src={cover.url} alt="" loading="lazy" className="absolute inset-0 size-full scale-110 object-cover blur-xl" />}
      <div aria-hidden className="absolute inset-x-6 bottom-6 space-y-2 blur-sm">
        <div className="h-3 w-1/3 rounded-full bg-white/70" /><div className="h-7 w-2/3 rounded-full bg-white/70" /><div className="h-3 w-1/2 rounded-full bg-white/70" />
      </div>
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <div className="rounded-[18px] bg-white/90 px-5 py-4 shadow-[var(--shadow-soft)] backdrop-blur">
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-ink"><Lock aria-hidden size={15} />Clients only</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">A special event for clients with a Re·Form package.</p>
          {!signedIn && <Link href="/login?next=/events" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4">Already a client? Sign in</Link>}
        </div>
      </div>
    </div>
  );
}
