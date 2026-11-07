import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock, MapPin } from "lucide-react";
import { Badge, Eyebrow } from "@/components/ui";
import type { Availability } from "@/lib/data";
import type { MediaItem } from "@/lib/media";
import { eur } from "@/lib/money";
import { longDate, time } from "@/lib/time";
import { eventTitleClass } from "@/lib/event-font";

/** Her background picture (or the soft gradient), with the details on a frosted panel so the text stays readable. */
export function EventCard({ e, cover, booked, clientsOnly, font, priority = false }: { e: Availability; cover?: MediaItem; booked: boolean; clientsOnly: boolean; font?: string | null; priority?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#d9ecf3] via-lilac-100 to-mauve-soft">
      {cover && <Image src={cover.url} alt="" fill sizes="(max-width: 480px) 100vw, 480px" priority={priority} className="object-cover" />}
      <div className={`relative p-6 ${cover ? "pt-36" : ""}`}>
        <div className={cover ? "-mx-3 -mb-3 rounded-[18px] bg-white/85 p-4 backdrop-blur-md" : ""}>
          <Eyebrow>{longDate(e.starts_at)} · {time(e.starts_at)}</Eyebrow>
          <h3 className={`mt-2 text-ink ${eventTitleClass(font)}`}>{e.title}</h3>
          {e.description && <p className="mt-3 text-sm leading-relaxed text-ink">{e.description}</p>}
          {e.location && <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin aria-hidden size={14} />{e.location}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {booked ? <Badge tone="booked">You&apos;re booked</Badge>
              : e.spots_left ? <Badge tone="open">{e.spots_left} of {e.capacity} spots left · {e.price_cents === 0 ? "Free" : eur(e.price_cents)}</Badge>
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
export function LockedEvent({ cover, signedIn, next = "/events" }: { cover?: MediaItem; signedIn: boolean; next?: string }) {
  return (
    <div className="relative h-56 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-[#d9ecf3] via-lilac-100 to-mauve-soft shadow-[var(--shadow-soft)]">
      {cover && <Image src={cover.url} alt="" fill sizes="(max-width: 480px) 100vw, 480px" className="scale-110 object-cover blur-xl" />}
      <div aria-hidden className="absolute inset-x-6 bottom-6 space-y-2 blur-sm">
        <div className="h-3 w-1/3 rounded-full bg-white/70" /><div className="h-7 w-2/3 rounded-full bg-white/70" /><div className="h-3 w-1/2 rounded-full bg-white/70" />
      </div>
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <div className="rounded-[18px] bg-white/90 px-5 py-4 shadow-[var(--shadow-soft)] backdrop-blur">
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-ink"><Lock aria-hidden size={15} />Clients only</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">For clients with a Re·Form package.</p>
          {!signedIn && <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4">Already a client? Sign in</Link>}
        </div>
      </div>
    </div>
  );
}
