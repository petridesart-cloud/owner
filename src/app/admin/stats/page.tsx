import type { ReactNode } from "react";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { addDaysKey, localToUtc, monthYear, todayKey, weekdayShort } from "@/lib/time";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { cash: "Cash", revolut: "Revolut", card_in_person: "Card (studio)", online: "Online", bank_transfer: "Bank" };

/** Big number with its context on the same line ("12 of 21 spots"). */
function Big({ label, value, after, hint }: { label: string; value: ReactNode; after?: string; hint?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5"><span className="font-serif text-3xl leading-none text-ink">{value}</span>{after && <span className="text-sm text-ink-soft">{after}</span>}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

type S = { starts_at: string; capacity: number; class_types: { kind: string } | null; bookings: { status: string; checked_in_at: string | null }[] };
const booked = (list: S[]) => list.reduce((n, s) => n + s.bookings.filter((b) => b.status === "confirmed" || b.status === "no_show").length, 0);
const spots = (list: S[]) => list.reduce((n, s) => n + s.capacity, 0);
const pct = (b: number, c: number) => (c ? `${Math.round((b / c) * 100)}%` : "–");

export default async function StatsPage() {
  const today = todayKey();
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDaysKey(today, -dow);
  const monthKey = `${today.slice(0, 8)}01`;
  const [y, m] = today.split("-").map(Number);
  const nextMonthKey = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const wFrom = localToUtc(weekStart, "00:00"), wTo = localToUtc(addDaysKey(weekStart, 7), "00:00");
  const mFrom = localToUtc(monthKey, "00:00"), mTo = localToUtc(nextMonthKey, "00:00");
  const yearStart = localToUtc(`${today.slice(0, 4)}-01-01`, "00:00");

  const sel = "starts_at, capacity, class_types(kind), bookings!bookings_session_id_fkey(status, checked_in_at)";
  const [{ data: week }, { data: month }, { data: monthPay }, { count: newClients }, { data: yearPayments }, { data: monthLedger }] = await Promise.all([
    db().from("class_sessions").select(sel).eq("status", "scheduled").gte("starts_at", wFrom).lt("starts_at", wTo),
    db().from("class_sessions").select(sel).eq("status", "scheduled").gte("starts_at", mFrom).lt("starts_at", mTo),
    db().from("payments").select("amount_cents, purpose, products(credit_kind, tag)").eq("status", "paid").gte("paid_at", mFrom).lt("paid_at", mTo),
    db().from("profiles").select("id", { count: "exact", head: true }).eq("role", "client").is("deleted_at", null).gte("created_at", mFrom),
    db().from("payments").select("amount_cents, method, provider, paid_at").eq("status", "paid").gte("paid_at", yearStart),
    db().from("credit_ledger").select("delta, entry_type").gte("created_at", mFrom).lt("created_at", mTo),
  ]);
  const W = (week ?? []) as S[], M = (month ?? []) as S[];
  const revenue = (monthPay ?? []).reduce((n, p) => n + p.amount_cents, 0);

  // Reformer vs mat, this month.
  const kinds = (["reformer", "mat"] as const).map((k) => {
    const list = M.filter((s) => s.class_types?.kind === k);
    const pays = (monthPay ?? []).filter((p) => p.products?.credit_kind === k);
    return {
      k, label: k === "reformer" ? "Reformer" : "Mat", classes: list.length, booked: booked(list), spots: spots(list),
      attended: list.reduce((n, s) => n + s.bookings.filter((b) => b.checked_in_at).length, 0),
      packs: pays.filter((p) => p.purpose === "pack").length, revenue: pays.reduce((n, p) => n + p.amount_cents, 0),
    };
  });

  const byDay = Array.from({ length: 7 }, (_, i) => {
    const k = addDaysKey(weekStart, i);
    const list = W.filter((s) => s.starts_at >= localToUtc(k, "00:00") && s.starts_at < localToUtc(addDaysKey(k, 1), "00:00"));
    const c = spots(list), b = booked(list);
    return { k, label: weekdayShort(`${k}T12:00:00Z`), pct: c ? Math.round((b / c) * 100) : null, b, c };
  });

  // Package classes: used this month (booked minus returned) and left to expire unused.
  const sum = (t: string) => (monthLedger ?? []).filter((e) => e.entry_type === t).reduce((n, e) => n + e.delta, 0);
  const used = -sum("booking_debit") - sum("cancel_refund");
  const expired = -sum("expiry");

  const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", month: "short" });
  const table = new Map<string, Map<string, number>>();
  for (const p of yearPayments ?? []) {
    const mo = monthFmt.format(new Date(p.paid_at!));
    const meth = METHOD[p.method ?? (p.provider === "offline" ? "cash" : "online")] ?? p.method ?? "Other";
    const row = table.get(mo) ?? new Map(); row.set(meth, (row.get(meth) ?? 0) + p.amount_cents); table.set(mo, row);
  }
  const methods = [...new Set([...table.values()].flatMap((r) => [...r.keys()]))];
  const wb = booked(W), ws = spots(W), mb = booked(M), ms = spots(M);

  return (
    <div>
      <AdminTitle title="Stats" />

      <h2 className="display mb-2 text-[0.95rem]">This week</h2>
      <div className="grid grid-cols-2 gap-2">
        <Big label="Bookings" value={wb} after={`of ${ws} spots`} />
        <Big label="Fill rate" value={pct(wb, ws)} after={`of ${ws} spots`} />
      </div>

      <h2 className="display mb-2 mt-6 text-[0.95rem]">{monthYear(`${monthKey}T12:00:00Z`)}</h2>
      <div className="grid grid-cols-2 gap-2">
        <Big label="Bookings" value={mb} after={`of ${ms} spots`} />
        <Big label="Fill rate" value={pct(mb, ms)} after={`of ${ms} spots`} />
        <Big label="Revenue" value={eur(revenue)} hint="Everything marked as paid" />
        <Big label="New clients" value={newClients ?? 0} after="signed up" />
      </div>

      <section className="card mt-6 px-4 py-4" aria-labelledby="kinds">
        <h2 id="kinds" className="display mb-3 text-[0.95rem]">Reformer vs mat · this month</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="text-ink-soft"><th scope="col" className="py-1 font-normal"><span className="sr-only">Measure</span></th>{kinds.map((k) => <th key={k.k} scope="col" className="py-1 text-right font-medium text-ink">{k.label}</th>)}</tr></thead>
          <tbody>
            {([
              ["Classes", (k: (typeof kinds)[number]) => k.classes],
              ["Bookings", (k: (typeof kinds)[number]) => `${k.booked} of ${k.spots}`],
              ["Fill rate", (k: (typeof kinds)[number]) => pct(k.booked, k.spots)],
              ["Attended", (k: (typeof kinds)[number]) => k.attended],
              ["Packages sold", (k: (typeof kinds)[number]) => k.packs],
              ["Revenue", (k: (typeof kinds)[number]) => eur(k.revenue)],
            ] as const).map(([label, f]) => (
              <tr key={label} className="border-t border-line"><th scope="row" className="py-2 font-normal text-ink-soft">{label}</th>{kinds.map((k) => <td key={k.k} className="py-2 text-right text-ink">{f(k)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mt-6 px-4 py-4" aria-labelledby="fill-heading">
        <h2 id="fill-heading" className="display mb-4 text-[0.95rem]">Fill rate by day · this week</h2>
        <ul className="space-y-2.5">
          {byDay.map((d) => (
            <li key={d.k} className="grid grid-cols-[3rem_1fr_5.5rem] items-center gap-3 text-sm">
              <span className="text-ink">{d.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-lilac-50" aria-hidden>
                <span className="block h-full rounded-full bg-lilac-300" style={{ width: `${d.pct ?? 0}%` }} />
              </span>
              <span className="text-right text-ink-soft">{d.pct == null ? "no classes" : `${d.pct}% · ${d.b}/${d.c}`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-6 px-4 py-4" aria-labelledby="pkg">
        <h2 id="pkg" className="display mb-1 text-[0.95rem]">Package classes · this month</h2>
        <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="font-serif text-3xl text-ink">{used}</span><span className="text-sm text-ink-soft">used</span><span className="ml-3 font-serif text-3xl text-ink">{expired}</span><span className="text-sm text-ink-soft">expired unused</span></p>
        <p className="mt-1 text-xs text-ink-soft">Classes taken from clients&apos; packages this month, and classes that ran out on their end date without being used.</p>
      </section>

      <section className="card mt-6 overflow-x-auto px-4 py-4" aria-labelledby="by-method">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="by-method" className="display text-[0.95rem]">Payments by method · {today.slice(0, 4)}</h2>
          <a href={`/admin/export/payments?year=${today.slice(0, 4)}`} className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-3 text-sm text-ink">Export CSV</a>
        </div>
        <table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="py-1.5 font-medium">Month</th>{methods.map((mm) => <th key={mm} scope="col" className="py-1.5 text-right font-medium">{mm}</th>)}</tr></thead>
          <tbody>{[...table].map(([mo, row]) => <tr key={mo} className="border-t border-line"><td className="py-1.5">{mo}</td>{methods.map((mm) => <td key={mm} className="py-1.5 text-right text-ink-soft">{row.get(mm) ? eur(row.get(mm)!) : "–"}</td>)}</tr>)}</tbody>
        </table>
        {table.size === 0 && <p className="text-sm text-ink-soft">No payments yet this year.</p>}
      </section>
    </div>
  );
}
