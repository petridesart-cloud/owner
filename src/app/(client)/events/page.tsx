import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { PhotoStrip } from "@/components/PhotoStrip";
import { Card, PageTitle, Section } from "@/components/ui";
import { EventCard, LockedEvent } from "@/components/EventCard";
import { getViewer } from "@/lib/auth";
import { getTexts } from "@/lib/content";
import { availability, eventExtras, lockedEventIds, viewerSessionState } from "@/lib/data";
import { getMediaIn } from "@/lib/media";
import { db } from "@/lib/supabase/admin";
import { longDate } from "@/lib/time";

export const metadata: Metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const now = new Date();
  const [viewer, texts, upcomingAll, { data: past }] = await Promise.all([
    getViewer(),
    getTexts(),
    // A-050: events only, so the 1,000-row cap on a year of classes can't hide the later ones.
    availability(now, new Date(now.getTime() + 730 * 86_400_000), { eventsOnly: true }),
    db().from("class_sessions").select("id, title, recap, starts_at, location, class_types!inner(kind)")
      .eq("class_types.kind", "event").eq("status", "scheduled").lt("starts_at", now.toISOString())
      .order("starts_at", { ascending: false }).limit(12),
  ]);
  const upcoming = upcomingAll.filter((c) => c.kind === "event" && c.status === "scheduled");
  const archive = past ?? [];
  const [state, extras, lockedIds, photos, covers] = await Promise.all([
    viewerSessionState(viewer?.profile.id),
    eventExtras(upcoming.map((e) => e.id)),
    lockedEventIds(upcoming.map((e) => e.id), viewer?.profile.id),
    getMediaIn(archive.map((e) => `event:${e.id}`)),
    getMediaIn(upcoming.map((e) => `event-cover:${e.id}`)),
  ]);

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
                      <EventCard e={e} cover={cover} clientsOnly={!!extras.get(e.id)?.clients_only} booked={state.booked.has(e.id)} font={extras.get(e.id)?.title_font} priority={e.id === upcoming[0]?.id} />
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
