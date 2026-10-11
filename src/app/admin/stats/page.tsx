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

  const yearStart = localToUtc(`${today.slice(0, 4)}-01-01`, "00:00");
  const [{ data: members }, { data: yearPayments }, { data: monthLedger }] = await Promise.all([
    db().from("memberships").select("status, products!memberships_product_id_fkey(name, price_cents, period_days)").in("status", ["active", "paused", "past_due"]),
    db().from("payments").select("amount_cents, method, provider, paid_at").eq("status", "paid").gte("paid_at", yearStart),
    db().from("credit_ledger").select("delta, entry_type").gte("created_at", monthStart),
  ]);
  const byPackage = new Map<string, number>();
  let mrr = 0;
  for (const m of members ?? []) {
    byPackage.set(m.products?.name ?? "?", (byPackage.get(m.products?.name ?? "?") ?? 0) + 1);
    if (m.status !== "paused") mrr += Math.round((m.products?.price_cents ?? 0) * (30 / (m.products?.period_days ?? 30)));
  }
  const used = -(monthLedger ?? []).filter((e) => e.entry_type === "booking_debit").reduce((n, e) => n + e.delta, 0)
    - (monthLedger ?? []).filter((e) => e.entry_type === "cancel_refund").reduce((n, e) => n + e.delta, 0);
  const expired = -(monthLedger ?? []).filter((e) => e.entry_type === "expiry").reduce((n, e) => n + e.delta, 0);
  const METHOD: Record<string, string> = { cash: "Cash", card_in_person: "Card (studio)", online: "Online", bank_transfer: "Bank" };
  const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", month: "short" });
  const table = new Map<string, Map<string, number>>();
  for (const p of yearPayments ?? []) {
    const mo = monthFmt.format(new Date(p.paid_at!));
    const meth = METHOD[p.method ?? (p.provider === "offline" ? "cash" : "online")] ?? p.method ?? "Other";
    const row = table.get(mo) ?? new Map(); row.set(meth, (row.get(meth) ?? 0) + p.amount_cents); table.set(mo, row);
  }
  const methods = [...new Set([...table.values()].flatMap((r) => [...r.keys()]))];

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
        <Stat label="Revenue" value={eur(revenue)} hint={`this month (all methods) · ${eur(packs)} from packs`} />
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
        <p className="mt-3 text-xs text-ink-soft">Revenue includes everything marked as paid (cash, card at the studio, online). Bookings added as &quot;settled outside the app&quot; aren&apos;t counted.</p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-2" aria-label="Memberships">
        <Stat label="Monthly recurring" value={eur(mrr)} hint={`${(members ?? []).length} active members`} />
        <Stat label="Classes this month" value={`${used} used`} hint={`${expired} expired unused`} />
      </section>
      {byPackage.size > 0 && (
        <section className="card mt-3 px-4 py-3">
          <h2 className="display mb-2 text-[0.95rem]">Members per package</h2>
          <ul className="divide-y divide-line text-sm">{[...byPackage].map(([k, v]) => <li key={k} className="flex justify-between py-2"><span>{k}</span><span className="text-ink-soft">{v}</span></li>)}</ul>
        </section>
      )}

      <section className="card mt-6 overflow-x-auto px-4 py-4" aria-labelledby="by-method">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="by-method" className="display text-[0.95rem]">Payments by method · {today.slice(0, 4)}</h2>
          <a href={`/admin/export/payments?year=${today.slice(0, 4)}`} className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-3 text-sm text-ink">Export CSV</a>
        </div>
        <table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="py-1.5 font-medium">Month</th>{methods.map((m) => <th key={m} scope="col" className="py-1.5 text-right font-medium">{m}</th>)}</tr></thead>
          <tbody>{[...table].map(([mo, row]) => <tr key={mo} className="border-t border-line"><td className="py-1.5">{mo}</td>{methods.map((m) => <td key={m} className="py-1.5 text-right text-ink-soft">{row.get(m) ? eur(row.get(m)!) : "–"}</td>)}</tr>)}</tbody>
        </table>
        {table.size === 0 && <p className="text-sm text-ink-soft">No payments yet this year.</p>}
      </section>
    </div>
  );
}
