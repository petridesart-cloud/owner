import Link from "next/link";
import { Badge } from "@/components/ui";
import { sessionsWithRoster } from "@/lib/admin-data";
import { db } from "@/lib/supabase/admin";
import { addDaysKey, localToUtc, longDate, time, todayKey } from "@/lib/time";
import { scheduleTick } from "@/lib/tick";
import { CheckInToggle } from "./RosterControls";
import { MarkPaid, RemoveRequest, RenewButtons } from "./PaymentButtons";
import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { cancelToday } from "./actions";
import { eur } from "@/lib/money";
import { dayMonth, nowMs } from "@/lib/time";
import { AdminTitle, Stat } from "./ui";
import { getSettings } from "@/lib/auth";
import { ago, schedulerHealthy } from "@/lib/scheduler";
import { HealthInfo } from "./HealthInfo";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { cash: "cash", revolut: "Revolut", bank_transfer: "bank transfer", card_in_person: "card" };
const flag = "mr-1 inline-block rounded-full px-2 py-0.5 font-medium";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  scheduleTick();
  const { day } = await searchParams;
  const key = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayKey();
  const settings = await getSettings();
  const sessions = await sessionsWithRoster(localToUtc(key, "00:00"), localToUtc(addDaysKey(key, 1), "00:00"));
  const live = sessions.filter((s) => s.status === "scheduled");
  const booked = live.reduce((n, s) => n + s.roster.length, 0);
  const cap = live.reduce((n, s) => n + s.capacity, 0);
  const isToday = key === todayKey();
  const [{ count: pendingRefunds }, { data: awaiting }, { data: renewals }] = await Promise.all([
    db().from("payments").select("id", { count: "exact", head: true }).eq("status", "needs_refund"),
    db().from("payments").select("id, description, amount_cents, created_at, purpose, intended_method, profiles(id, full_name)").eq("status", "pending").eq("provider", "offline").order("created_at"),
    db().from("memberships").select("id, current_period_end, status, profiles(id, full_name), products!memberships_product_id_fkey(name, price_cents)")
      .eq("provider", "offline").eq("cancel_at_period_end", false).in("status", ["active", "past_due"])
      .lte("current_period_end", new Date(nowMs() + 7 * 86_400_000).toISOString()).order("current_period_end"),
  ]);

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
      {settings.last_cron_tick_at && !schedulerHealthy(settings.last_cron_tick_at) && (
        <p role="alert" className="mb-5 rounded-2xl border border-burgundy/25 bg-burgundy-soft px-4 py-3 text-sm text-burgundy">
          Automatic reminders last ran {ago(settings.last_cron_tick_at)}. Open <Link href="/admin/outbox" className="font-medium underline underline-offset-4">Settings → Messages</Link> and tap &ldquo;Send due reminders now&rdquo;, then let your developer know.
        </p>
      )}
      {(pendingRefunds ?? 0) > 0 && (
        <p role="status" className="mb-5 rounded-2xl border border-burgundy/25 bg-burgundy-soft px-4 py-3 text-sm text-burgundy">
          {pendingRefunds} payment{pendingRefunds === 1 ? "" : "s"} need a manual refund in Stripe (paid after the spot was gone, or a cancelled event).
        </p>
      )}

      {isToday && (awaiting ?? []).length > 0 && (
        <section className="card mb-5 overflow-hidden" aria-labelledby="awaiting">
          <h2 id="awaiting" className="display border-b border-line px-4 py-3 text-[0.95rem]">Awaiting payment</h2>
          <ul className="divide-y divide-line">
            {awaiting!.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/clients/${p.profiles?.id}`} className="block truncate text-sm font-medium text-ink hover:underline">{p.profiles?.full_name}</Link>
                  <p className="truncate text-xs text-ink-soft">{p.description} · {eur(p.amount_cents)}</p>
                  {p.intended_method && <p className="text-xs font-medium text-plum-700">Will pay: {METHOD[p.intended_method] ?? p.intended_method}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <MarkPaid paymentId={p.id} prefer={p.intended_method} label={`${p.profiles?.full_name}: ${p.description}`} />
                  <RemoveRequest paymentId={p.id} label={`${p.profiles?.full_name}: ${p.description}`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isToday && (renewals ?? []).length > 0 && (
        <section className="card mb-5 overflow-hidden" aria-labelledby="renewals">
          <h2 id="renewals" className="display border-b border-line px-4 py-3 text-[0.95rem]">Renewals due</h2>
          <ul className="divide-y divide-line">
            {renewals!.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/clients/${m.profiles?.id}`} className="block truncate text-sm font-medium text-ink hover:underline">{m.profiles?.full_name}</Link>
                  <p className="truncate text-xs text-ink-soft">{m.products?.name} · {eur(m.products?.price_cents ?? 0)} · {new Date(m.current_period_end) < new Date() ? "lapsed" : "ends"} {dayMonth(m.current_period_end)}</p>
                </div>
                <RenewButtons membershipId={m.id} name={m.profiles?.full_name ?? "client"} />
              </li>
            ))}
          </ul>
        </section>
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
                    <p className="text-xs text-ink-soft">
                      {b.birthday && <span className={`${flag} bg-mauve text-ink`}>Birthday 🎂</span>}
                      {b.firstClass && <span className={`${flag} bg-lilac-300 text-ink`}>First class</span>}
                      {b.minor && <span className={`${flag} bg-burgundy-soft text-burgundy`}>Under 18</span>}
                      {b.tag === "trial" && <span className={`${flag} bg-mauve text-ink`}>Trial</span>}
                      {b.tag === "drop_in" && <span className={`${flag} bg-lilac-100 text-ink`}>Drop-in</span>}
                      {b.profiles?.photo_consent === "none" && <span className={`${flag} bg-ink text-paper`}>No photos</span>}
                      {b.profiles?.photo_consent === "no_face" && <span className={`${flag} bg-ink/80 text-paper`}>No face</span>}
                      {b.paid_with === "pay_at_studio" && b.payment?.status !== "paid" && <span className={`${flag} bg-burgundy-soft text-burgundy`}>Unpaid{b.payment?.intended_method ? ` · ${METHOD[b.payment.intended_method]}` : ""}</span>}
                      {b.status === "no_show" ? "No-show" : b.paid_with === "credit" ? "Class credit" : b.paid_with === "payment" ? "Paid" : b.paid_with === "pay_at_studio" ? "Pay at studio" : "Manual / DM"}{b.profiles?.phone ? ` · ${b.profiles.phone}` : ""}
                    </p>
                    <HealthInfo h={b.profiles?.health_notes} />
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

      {isToday && live.some((x) => new Date(x.starts_at) > new Date()) && (
        <details className="card mt-6 px-5 py-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-burgundy">Cancel the rest of today</summary>
          <p className="mt-1 text-sm text-ink-soft">Unwell or need a break? Cancels every remaining class today, tells everyone booked (email + SMS) and returns their classes. The waitlist isn&apos;t offered anything.</p>
          <div className="mt-3 pb-2">
            <ActionForm action={cancelToday} submit="Cancel today's remaining classes" variant="danger" confirm="Cancel all remaining classes today and notify everyone?">
              <Field id="reason" label="Message to clients"><input id="reason" name="reason" placeholder="So sorry, I'm unwell today. Your class is back in your account." className={inputClass} /></Field>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
