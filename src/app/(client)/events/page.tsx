import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { PhotoStrip } from "@/components/PhotoStrip";
import { Badge, Card, Eyebrow, PageTitle, Section } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { availability, viewerSessionState } from "@/lib/data";
import { getMedia } from "@/lib/media";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { longDate, time } from "@/lib/time";

export const metadata: Metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const now = new Date();
  const [viewer, upcomingAll, photos, { data: past }] = await Promise.all([
    getViewer(),
    availability(now, new Date(now.getTime() + 365 * 86_400_000)),
    getMedia("event:"),
    db().from("class_sessions").select("id, title, description, starts_at, location, class_types!inner(kind)")
      .eq("class_types.kind", "event").eq("status", "scheduled").lt("starts_at", now.toISOString())
      .order("starts_at", { ascending: false }).limit(12),
  ]);
  const upcoming = upcomingAll.filter((c) => c.kind === "event" && c.status === "scheduled");
  const state = await viewerSessionState(viewer?.profile.id);

  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Events" script="Special">SUP Pilates, brunch and more. Paid individually, open to everyone.</PageTitle>

      <Section title="Coming up">
        {upcoming.length ? (
          <ul className="space-y-3">
            {upcoming.map((e) => {
              const booked = state.booked.has(e.id);
              return (
                <li key={e.id}>
                  <Link href={`/book/${e.id}`} className="block overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#d9ecf3] via-lilac-100 to-mauve-soft p-6 shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)]">
                    <Eyebrow>{longDate(e.starts_at)} · {time(e.starts_at)}</Eyebrow>
                    <h3 className="mt-2 font-script text-[2.4rem] leading-none text-ink">{e.title}</h3>
                    {e.description && <p className="mt-3 text-sm leading-relaxed text-ink">{e.description}</p>}
                    {e.location && <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin aria-hidden size={14} />{e.location}</p>}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      {booked ? <Badge tone="booked">You&apos;re booked</Badge> : e.spots_left ? <Badge tone="open">{e.spots_left} spots · {eur(e.price_cents)}</Badge> : <Badge tone="waitlist">Full · Join waitlist</Badge>}
                      <ArrowRight aria-hidden size={17} className="text-ink" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Card className="px-5 py-6 text-sm text-ink-soft">New events are announced on Instagram first. Check back soon.</Card>
        )}
      </Section>

      {(past ?? []).length > 0 && (
        <Section title="Previous events" className="mt-10">
          <ul className="-mx-5 space-y-7">
            {past!.map((e) => (
              <li key={e.id}>
                <div className="mb-3 px-5">
                  <p className="font-medium text-ink">{e.title}</p>
                  <p className="text-sm text-ink-soft">{longDate(e.starts_at)}{e.location ? ` · ${e.location}` : ""}</p>
                </div>
                <PhotoStrip photos={photos.filter((p) => p.slot === `event:${e.id}`)} label={e.title ?? "Event"} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
