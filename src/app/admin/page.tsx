import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { Badge } from "@/components/ui";
import { sessionsWithRoster } from "@/lib/admin-data";
import { db } from "@/lib/supabase/admin";
import { addDaysKey, localToUtc, longDate, time, todayKey } from "@/lib/time";
import { scheduleTick } from "@/lib/tick";
import { CheckInToggle } from "./RosterControls";
import { AdminTitle, Stat } from "./ui";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  scheduleTick();
  const { day } = await searchParams;
  const key = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayKey();
  const sessions = await sessionsWithRoster(localToUtc(key, "00:00"), localToUtc(addDaysKey(key, 1), "00:00"));
  const live = sessions.filter((s) => s.status === "scheduled");
  const booked = live.reduce((n, s) => n + s.roster.length, 0);
  const cap = live.reduce((n, s) => n + s.capacity, 0);
  const { count: pendingRefunds } = await db().from("payments").select("id", { count: "exact", head: true }).eq("status", "needs_refund");

  return (
    <div>
      <AdminTitle
        title={key === todayKey() ? "Today" : longDate(`${key}T12:00:00Z`)}
        sub={key === todayKey() ? longDate(`${key}T12:00:00Z`) : undefined}
        action={
          <div className="flex gap-1">
            <Link href={`/admin?day=${addDaysKey(key, -1)}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-3 text-sm" aria-label="Previous day">←</Link>
            <Link href={`/admin?day=${addDaysKey(key, 1)}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-3 text-sm" aria-label="Next day">→</Link>
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-2">
        <Stat label="Classes" value={live.length} />
        <Stat label="Booked" value={`${booked}/${cap}`} />
        <Stat label="Waitlist" value={live.reduce((n, s) => n + s.waitlist.length, 0)} />
      </div>
      {(pendingRefunds ?? 0) > 0 && (
        <p role="status" className="mb-5 rounded-2xl border border-burgundy/25 bg-burgundy-soft px-4 py-3 text-sm text-burgundy">
          {pendingRefunds} payment{pendingRefunds === 1 ? "" : "s"} need a manual refund in Stripe (paid after the spot was gone, or a cancelled event).
        </p>
      )}

      {sessions.length === 0 && (
        <div className="card px-5 py-8 text-center">
          <p className="font-serif text-xl text-ink">No classes on this day</p>
          <Link href={`/admin?day=${addDaysKey(key, 1)}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4">See the next day</Link>
        </div>
      )}
      <ul className="space-y-4">
        {sessions.map((s) => (
          <li key={s.id} className={`card overflow-hidden ${s.status === "cancelled" ? "opacity-60" : ""}`}>
            <Link href={`/admin/classes/${s.id}`} className="flex items-center justify-between gap-3 border-b border-line bg-lilac-50/70 px-4 py-3">
              <span>
                <span className="font-serif text-2xl text-ink">{time(s.starts_at)}</span>
                <span className="ml-2 text-sm font-medium text-ink">{s.name}</span>
              </span>
              {s.status === "cancelled" ? <Badge tone="full">Cancelled</Badge> : <Badge tone={s.roster.length >= s.capacity ? "mauve" : "lilac"}>{s.roster.length}/{s.capacity}</Badge>}
            </Link>
            <ul className="divide-y divide-line">
              {s.roster.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <CheckInToggle bookingId={b.id} checked={!!b.checked_in_at} name={b.profiles?.full_name ?? "Client"} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/clients/${b.profiles?.id}`} className="block truncate font-medium text-ink hover:underline">{b.profiles?.full_name ?? "Client"}</Link>
                    <p className="text-xs text-ink-soft">{b.status === "no_show" ? "No-show" : b.paid_with === "credit" ? "Credit" : b.paid_with === "payment" ? "Paid online" : "Manual / DM"}{b.profiles?.phone ? ` · ${b.profiles.phone}` : ""}</p>
                    {b.profiles?.health_notes?.note && (
                      <details className="mt-1 text-xs text-burgundy">
                        <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 font-medium"><HeartPulse aria-hidden size={13} /> Health note</summary>
                        <p className="pb-1 text-ink">{b.profiles.health_notes.note}</p>
                      </details>
                    )}
                  </div>
                </li>
              ))}
              {s.roster.length === 0 && s.status === "scheduled" && <li className="px-4 py-3 text-sm text-ink-soft">No bookings yet.</li>}
              {s.waitlist.length > 0 && (
                <li className="px-4 py-2.5 text-xs text-ink-soft">Waitlist: {s.waitlist.map((w) => w.profiles?.full_name + (w.status === "offered" ? " (offered)" : "")).join(", ")}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
