import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Availability } from "@/lib/data";
import { longDate, time } from "@/lib/time";
import { Badge } from "./ui";

export function spotsLabel(c: Pick<Availability, "kind" | "spots_left" | "capacity">) {
  const unit = c.kind === "reformer" ? (c.capacity === 1 ? "reformer" : "reformers") : c.capacity === 1 ? "spot" : "spots";
  if (c.spots_left === 0) return "Full";
  return `${c.spots_left} of ${c.capacity} ${unit} left`;
}

export function ClassRow({ c, state, showDate = false }: { c: Availability; state?: "booked" | "waiting" | "offered"; showDate?: boolean }) {
  const full = c.spots_left === 0;
  const cancelled = c.status === "cancelled";
  const past = new Date(c.starts_at) <= new Date();
  const mins = Math.round((new Date(c.ends_at).getTime() - new Date(c.starts_at).getTime()) / 60000);
  const action = cancelled ? "View" : state === "booked" ? "View booking for" : full ? "Join waitlist for" : "Book";
  const label = `${action} ${time(c.starts_at)} ${c.title}, ${longDate(c.starts_at)}. ${cancelled ? "Cancelled." : spotsLabel(c) + "."}`;

  return (
    <Link
      href={`/book/${c.id}`}
      aria-label={label}
      className={`card pressable group relative flex min-h-[76px] items-center gap-4 overflow-hidden px-4 py-3.5 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] ${cancelled || past ? "opacity-60" : ""}`}
    >
      <div className="w-[4.3rem] shrink-0">
        <p className="font-serif text-[1.65rem] leading-none text-ink">{time(c.starts_at)}</p>
        <p className="mt-1 text-[0.7rem] text-ink-soft">{showDate ? longDate(c.starts_at).split(" ").slice(0, 3).join(" ") : `${mins} min`}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          {c.kind === "reformer" ? (
            <><span className="font-script text-[1.35rem] font-normal leading-none text-plum-700">Reformer</span> Pilates</>
          ) : (
            c.title
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {cancelled ? (
            <Badge tone="full">Cancelled</Badge>
          ) : state === "booked" ? (
            <Badge tone="booked">You&apos;re booked</Badge>
          ) : state === "offered" ? (
            <Badge tone="booked">Spot offered to you</Badge>
          ) : state === "waiting" ? (
            <Badge tone="waitlist">On the waitlist</Badge>
          ) : full ? (
            <Badge tone="waitlist">Full · Join waitlist</Badge>
          ) : (
            <Badge tone="open">{spotsLabel(c)}</Badge>
          )}
          {c.kind === "event" && <Badge tone="plain">Special event</Badge>}
        </div>
      </div>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-soft transition group-hover:translate-x-0.5" />
    </Link>
  );
}
