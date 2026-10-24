import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Repeat } from "lucide-react";
import { Badge, ButtonLink, Card, Notice, PageTitle, Section } from "@/components/ui";
import { AwaitingPayment } from "@/components/AwaitingPayment";
import { PackageCard, PastPackageRow } from "@/components/PackageCard";
import { getSettings, requireViewer } from "@/lib/auth";
import { clientPackages } from "@/lib/packages";
import { recurringSummary } from "@/lib/recurring";
import { db } from "@/lib/supabase/admin";
import { dayMonth, longDate, nowMs, relativeHours, time, weekdayShort } from "@/lib/time";
import { CancelButton } from "./CancelButton";
import { eur } from "@/lib/money";

export const metadata: Metadata = { title: "My classes" };
export const dynamic = "force-dynamic";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ purchased?: string; requested?: string }> }) {
  const { purchased, requested } = await searchParams;
  const viewer = await requireViewer("/bookings");
  const p = viewer.profile;
  const settings = await getSettings();
  const [packages, weekly, { data: bookings }, { data: waits }, { data: pending }] = await Promise.all([
    clientPackages(p.id),
    recurringSummary(p.id),
    db().from("bookings").select("id, status, paid_with, late_refund_pending, payment:payments!bookings_payment_id_fkey(status, amount_cents, intended_method), class_sessions!inner(id, starts_at, ends_at, title, location, class_types(name, kind))")
      .eq("profile_id", p.id).eq("status", "confirmed").gt("class_sessions.starts_at", new Date().toISOString()),
    db().from("waitlist_entries").select("id, status, offer_expires_at, created_at, class_sessions!inner(id, starts_at, title, class_types(name))")
      .eq("profile_id", p.id).in("status", ["waiting", "offered"]),
    db().from("payments").select("id, description, amount_cents, created_at, booking_id, intended_method")
      .eq("profile_id", p.id).eq("status", "pending").eq("provider", "offline").order("created_at"),
  ]);

  const now = nowMs();
  const upcoming = (bookings ?? []).map((b) => ({ ...b, s: b.class_sessions, name: b.class_sessions.title ?? b.class_sessions.class_types?.name ?? "Class" }))
    .sort((a, b) => a.s.starts_at.localeCompare(b.s.starts_at));
  const current = packages.filter((x) => x.current);
  const past = packages.filter((x) => !x.current);
  const cutoffMs = settings.cancellation_cutoff_hours * 3_600_000;

  return (
    <div>
      <PageTitle eyebrow="My profile" title="My classes">My progress</PageTitle>

      <div className="space-y-6">
        {purchased && <div className="px-5"><Notice tone="success">Thank you! Your classes are ready to book.</Notice></div>}
        {requested && <div className="px-5"><Notice tone="success">Request sent. As soon as your payment is confirmed, your classes appear here.</Notice></div>}

        <AwaitingPayment pending={pending ?? []} settings={settings} />

        {current.length > 0 ? (
          <section aria-label="Current package" className="space-y-3 px-5">
            {current.map((x) => <PackageCard key={x.id} p={x} />)}
            {(() => {
              // Nearly done: 1 class left, or it ends within a week.
              const ending = current.find((x) => x.remaining <= 1 || (x.expiresAt && new Date(x.expiresAt).getTime() - now < 7 * 86_400_000));
              if (!ending || (pending ?? []).some((x) => !x.booking_id)) return null;
              return (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-mauve-soft px-4 py-3">
                  <p className="text-sm text-ink">{ending.remaining <= 1 ? `${ending.remaining ? "1 class" : "No classes"} left` : "Your package ends soon"}. Keep your rhythm going.</p>
                  <ButtonLink href={ending.kind === "mat" ? "/packs?type=mat" : "/packs"} variant="primary" className="min-h-11 shrink-0 px-4 text-[0.7rem]">Renew</ButtonLink>
                </div>
              );
            })()}
            <Link href="/bookings/weekly" className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline">
              <Repeat aria-hidden size={16} /> {weekly.length ? `Every week: ${weekly.join(", ")}` : "Book the same days every week"}
            </Link>
          </section>
        ) : !(pending ?? []).some((x) => !x.booking_id) && (
          <div className="px-5">
            <Card className="px-5 py-6 text-center">
              <p className="font-serif text-xl text-ink">No package yet</p>
              <p className="mt-1 text-sm text-ink-soft">A package is the easiest way to keep your rhythm.</p>
              <ButtonLink href="/packs" className="mt-4">Secure your package</ButtonLink>
            </Card>
          </div>
        )}

        {(waits ?? []).length > 0 && (
          <Section title="Waitlist">
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
                      {offered ? <Badge tone="booked">Claim · {relativeHours(w.offer_expires_at!)} left</Badge> : <Badge tone="waitlist">Waiting</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title="Upcoming">
          {upcoming.length ? (
            <ul className="space-y-3">
              {upcoming.map((b) => {
                const start = new Date(b.s.starts_at).getTime();
                const late = start - now < cutoffMs;
                const label = `Cancel ${time(b.s.starts_at)} ${b.name}, ${longDate(b.s.starts_at)}`;
                const warning = late
                  ? b.late_refund_pending || settings.refund_late_cancel_if_filled
                    ? `You're inside the ${settings.cancellation_cutoff_hours}-hour window. Your spot goes to the waitlist; if it's re-booked, we'll return your class.`
                    : `You're inside the ${settings.cancellation_cutoff_hours}-hour window, so this class won't be returned. Releasing it lets someone on the waitlist take your spot.`
                  : b.paid_with === "credit" ? "Your class goes back to your package straight away." : "Your spot will be released.";
                return (
                  <li key={b.id}>
                    <Card className="overflow-hidden">
                      <div className="flex gap-4 px-4 py-4">
                        <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-mauve py-2 text-center">
                          <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink">{weekdayShort(b.s.starts_at)}</span>
                          <span className="font-serif text-2xl leading-none text-ink">{dayMonth(b.s.starts_at).split(" ")[0]}</span>
                          <span className="text-[0.65rem] uppercase text-ink">{dayMonth(b.s.starts_at).split(" ")[1]}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">{b.name}</p>
                          <p className="text-sm text-ink-soft">{time(b.s.starts_at)}–{time(b.s.ends_at)}{b.s.location ? ` · ${b.s.location}` : ""}</p>
                          {b.paid_with === "pay_at_studio" && b.payment?.status === "pending" && (
                            <p className="mt-1.5"><Badge tone="waitlist">To pay {eur(b.payment.amount_cents)}{b.payment.intended_method ? ` · ${b.payment.intended_method === "revolut" ? "Revolut" : "cash"}` : ""} before class</Badge></p>
                          )}
                          <a href={`/api/ics/${b.id}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:underline">
                            <CalendarPlus aria-hidden size={15} /> Add to calendar
                          </a>
                        </div>
                      </div>
                      <div className="border-t border-line bg-paper/60 px-4 py-3">
                        {b.s.class_types?.kind === "event" ? (
                          <p className="text-xs leading-relaxed text-ink-soft">Events can&apos;t be cancelled or refunded in the app. Can&apos;t make it? Message the studio.</p>
                        ) : <>
                        {late && (
                          <p className="mb-2 text-xs leading-relaxed text-ink-soft">
                            Free cancellation closed {relativeHours(new Date(start - cutoffMs))} ago ({settings.cancellation_cutoff_hours}h before class).
                          </p>
                        )}
                        <CancelButton bookingId={b.id} late={late} label={label} warning={warning} />
                        </>}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Card className="px-5 py-7 text-center">
              <p className="font-serif text-xl text-ink">No sessions booked</p>
              <p className="mt-1 text-sm text-ink-soft">Your next class is a tap away.</p>
              <ButtonLink href="/schedule" variant="soft" className="mt-4">See the schedule</ButtonLink>
            </Card>
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Past packages">
            <ul className="card divide-y divide-line overflow-hidden">
              {past.map((x) => <li key={x.id}><PastPackageRow p={x} /></li>)}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
