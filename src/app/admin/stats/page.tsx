import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { addDaysKey, localToUtc, todayKey, weekdayShort } from "@/lib/time";
import { AdminTitle, Stat } from "../ui";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const today = todayKey();
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDaysKey(today, -dow);
  const from = localToUtc(weekStart, "00:00"), to = localToUtc(addDaysKey(weekStart, 7), "00:00");
  const monthStart = localToUtc(`${today.slice(0, 8)}01`, "00:00");

  const [{ data: sessions }, { data: payments }, { count: newClients }] = await Promise.all([
    db().from("class_sessions").select("id, starts_at, capacity, bookings(status)").eq("status", "scheduled").gte("starts_at", from).lt("starts_at", to),
    db().from("payments").select("amount_cents, purpose").eq("status", "paid").gte("paid_at", monthStart),
    db().from("profiles").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
  ]);
  const cap = (sessions ?? []).reduce((n, s) => n + s.capacity, 0);
  const booked = (sessions ?? []).reduce((n, s) => n + s.bookings.filter((b) => b.status === "confirmed").length, 0);
  const revenue = (payments ?? []).reduce((n, p) => n + p.amount_cents, 0);
  const packs = (payments ?? []).filter((p) => p.purpose === "pack").reduce((n, p) => n + p.amount_cents, 0);

  const byDay = Array.from({ length: 7 }, (_, i) => {
    const k = addDaysKey(weekStart, i);
    const list = (sessions ?? []).filter((s) => s.starts_at >= localToUtc(k, "00:00") && s.starts_at < localToUtc(addDaysKey(k, 1), "00:00"));
    const c = list.reduce((n, s) => n + s.capacity, 0);
    const b = list.reduce((n, s) => n + s.bookings.filter((x) => x.status === "confirmed").length, 0);
    return { k, label: weekdayShort(`${k}T12:00:00Z`), pct: c ? Math.round((b / c) * 100) : null, b, c };
  });

  return (
    <div>
      <AdminTitle title="Stats" sub="This week and this month" />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Bookings this week" value={booked} hint={`of ${cap} spots`} />
        <Stat label="Fill rate" value={cap ? `${Math.round((booked / cap) * 100)}%` : "–"} hint="this week" />
        <Stat label="Online revenue" value={eur(revenue)} hint={`this month · ${eur(packs)} from packs`} />
        <Stat label="New clients" value={newClients ?? 0} hint="this month" />
      </div>
      <section className="card mt-6 px-4 py-4" aria-labelledby="fill-heading">
        <h2 id="fill-heading" className="display mb-4 text-[0.95rem]">Fill rate by day</h2>
        <ul className="space-y-2.5">
          {byDay.map((d) => (
            <li key={d.k} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-3 text-sm">
              <span className="text-ink">{d.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-lilac-50" aria-hidden>
                <span className="block h-full rounded-full bg-lilac-300" style={{ width: `${d.pct ?? 0}%` }} />
              </span>
              <span className="text-right text-ink-soft">{d.pct == null ? "no classes" : `${d.b}/${d.c} · ${d.pct}%`}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">Revenue counts online payments only; DM/cash bookings aren&apos;t included.</p>
      </section>
    </div>
  );
}
