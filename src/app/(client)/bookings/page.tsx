import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { Badge, ButtonLink, Card, Notice, PageTitle, Section } from "@/components/ui";
import { getSettings, requireViewer } from "@/lib/auth";
import { creditBalance } from "@/lib/data";
import { db } from "@/lib/supabase/admin";
import { dayMonth, longDate, relativeHours, time, weekdayShort } from "@/lib/time";
import { CancelButton } from "./CancelButton";

export const metadata: Metadata = { title: "My classes" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  cancelled: "Cancelled", late_cancelled: "Late cancel", studio_cancelled: "Cancelled by studio", no_show: "No-show", confirmed: "Attended",
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ purchased?: string }> }) {
  const { purchased } = await searchParams;
  const viewer = await requireViewer("/bookings");
  const p = viewer.profile;
  const settings = await getSettings();
  const [credits, { data: bookings }, { data: waits }] = await Promise.all([
    creditBalance(p.id),
    db().from("bookings").select("id, status, paid_with, checked_in_at, late_refund_pending, class_sessions!inner(id, starts_at, ends_at, title, location, class_types(name, kind))")
      .eq("profile_id", p.id).in("status", ["confirmed", "cancelled", "late_cancelled", "studio_cancelled", "no_show"])
      .order("starts_at", { referencedTable: "class_sessions", ascending: true }),
    db().from("waitlist_entries").select("id, status, offer_expires_at, created_at, class_sessions!inner(id, starts_at, title, class_types(name))")
      .eq("profile_id", p.id).in("status", ["waiting", "offered"]),
  ]);

  const now = Date.now();
  const all = (bookings ?? []).map((b) => ({ ...b, s: b.class_sessions, name: b.class_sessions.title ?? b.class_sessions.class_types?.name ?? "Class" }));
  all.sort((a, b) => a.s.starts_at.localeCompare(b.s.starts_at));
  const upcoming = all.filter((b) => b.status === "confirmed" && new Date(b.s.starts_at).getTime() > now);
  const past = all.filter((b) => !(b.status === "confirmed" && new Date(b.s.starts_at).getTime() > now)).reverse().slice(0, 12);
  const cutoffMs = settings.cancellation_cutoff_hours * 3_600_000;

  return (
    <div>
      <PageTitle eyebrow="Your practice" title="My classes" />

      {purchased && <div className="mb-4 px-5"><Notice tone="success">Thank you! Your credits are ready to use.</Notice></div>}

      <section aria-label="Credits" className="px-5">
        <div className="grid grid-cols-2 gap-2.5">
          {(["reformer", "mat"] as const).map((k) => {
            const expiry = k === "reformer" ? credits.reformerExpiry : credits.matExpiry;
            return (
              <Card key={k} className="px-4 py-4">
                <p className="eyebrow">{k} credits</p>
                <p className="mt-1 font-serif text-4xl leading-none text-ink">{credits[k]}</p>
                <p className="mt-2 text-xs text-ink-soft">{credits[k] && expiry ? `Next expiry ${dayMonth(expiry)}` : "No active pack"}</p>
              </Card>
            );
          })}
        </div>
        <Link href="/packs" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4">Buy a class pack</Link>
      </section>

      {(waits ?? []).length > 0 && (
        <Section title="Waitlist" className="mt-6">
          <ul className="space-y-2.5">
            {waits!.map((w) => {
              const offered = w.status === "offered" && w.offer_expires_at && new Date(w.offer_expires_at).getTime() > now;
              return (
                <li key={w.id}>
                  <Link href={`/book/${w.class_sessions.id}`} className="card flex min-h-16 items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="block font-medium text-ink">{w.class_sessions.title ?? w.class_sessions.class_types?.name}</span>
                      <span className="text-sm text-ink-soft">{longDate(w.class_sessions.starts_at)} · {time(w.class_sessions.starts_at)}</span>
                    </span>
                    {offered ? <Badge tone="mauve">Claim · {relativeHours(w.offer_expires_at!)} left</Badge> : <Badge tone="plain">Waiting</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Upcoming" className="mt-6">
        {upcoming.length ? (
          <ul className="space-y-3">
            {upcoming.map((b) => {
              const start = new Date(b.s.starts_at).getTime();
              const late = start - now < cutoffMs;
              const label = `Cancel ${time(b.s.starts_at)} ${b.name}, ${longDate(b.s.starts_at)}`;
              const warning = late
                ? b.late_refund_pending || settings.refund_late_cancel_if_filled
                  ? `You're inside the ${settings.cancellation_cutoff_hours}-hour window. Your spot goes to the waitlist; if it's re-booked, we'll return your credit.`
                  : `You're inside the ${settings.cancellation_cutoff_hours}-hour window, so this class won't be refunded. Releasing it lets someone on the waitlist take your spot.`
                : b.paid_with === "manual" ? "Your spot will be released." : "Your credit will be returned to your account straight away.";
              return (
                <li key={b.id}>
                  <Card className="overflow-hidden">
                    <div className="flex gap-4 px-4 py-4">
                      <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-lilac-100 py-2 text-center">
                        <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink-soft">{weekdayShort(b.s.starts_at)}</span>
                        <span className="font-serif text-2xl leading-none text-ink">{dayMonth(b.s.starts_at).split(" ")[0]}</span>
                        <span className="text-[0.65rem] uppercase text-ink-soft">{dayMonth(b.s.starts_at).split(" ")[1]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{b.name}</p>
                        <p className="text-sm text-ink-soft">{time(b.s.starts_at)}–{time(b.s.ends_at)}{b.s.location ? ` · ${b.s.location}` : ""}</p>
                        <a href={`/api/ics/${b.id}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:underline">
                          <CalendarPlus aria-hidden size={15} /> Add to calendar
                        </a>
                      </div>
                    </div>
                    <div className="border-t border-line bg-paper/60 px-4 py-3">
                      {late && (
                        <p className="mb-2 text-xs leading-relaxed text-ink-soft">
                          Free cancellation closed {relativeHours(new Date(start - cutoffMs))} ago ({settings.cancellation_cutoff_hours}h before class).
                        </p>
                      )}
                      <CancelButton bookingId={b.id} late={late} label={label} warning={warning} />
                    </div>
                  </Card>
                </li>
              );
            }).filter(Boolean)}
          </ul>
        ) : (
          <Card className="px-5 py-7 text-center">
            <p className="font-serif text-xl text-ink">Nothing booked yet</p>
            <p className="mt-1 text-sm text-ink-soft">Your next class is a tap away.</p>
            <ButtonLink href="/schedule" className="mt-4">Secure your spot</ButtonLink>
          </Card>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Past" className="mt-8">
          <ul className="card divide-y divide-line">
            {past.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="block text-ink">{b.name}</span>
                  <span className="text-ink-soft">{longDate(b.s.starts_at)} · {time(b.s.starts_at)}</span>
                </span>
                <Badge tone={b.status === "confirmed" ? "lilac" : "plain"}>{STATUS[b.status] ?? b.status}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
