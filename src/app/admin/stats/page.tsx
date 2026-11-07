import type { ReactNode } from "react";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { addDaysKey, localToUtc, monthYear, todayKey, weekdayShort } from "@/lib/time";
import { AdminTitle } from "../ui";
import { Pick } from "./Pick";
import { getKinds } from "@/lib/kinds";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { cash: "Cash", revolut: "Revolut", card_in_person: "Card (studio)", online: "Online", bank_transfer: "Bank" };
const MEASURES = [
  { value: "revenue", label: "Revenue" },
  { value: "packs", label: "Packages sold" },
  { value: "fill", label: "Fill rate" },
  { value: "bookings", label: "Bookings" },
  { value: "clients", label: "New clients" },
] as const;
type Measure = (typeof MEASURES)[number]["value"];

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

type S = { starts_at: string; capacity: number; class_types: { kind: string; credit_kind: string | null } | null; bookings: { status: string; checked_in_at: string | null }[] };
const booked = (list: S[]) => list.reduce((n, s) => n + s.bookings.filter((b) => b.status === "confirmed" || b.status === "no_show").length, 0);
const spots = (list: S[]) => list.reduce((n, s) => n + s.capacity, 0);
const pct = (b: number, c: number) => (c ? `${Math.round((b / c) * 100)}%` : "–");
const pad = (n: number) => String(n).padStart(2, "0");
const nextMonth = (key: string) => { const [y, m] = key.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`; };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string; show?: string }> }) {
  const q = await searchParams;
  const today = todayKey();
  const thisMonth = today.slice(0, 7), thisYear = Number(today.slice(0, 4));

  // The first month with a class, so the pickers only offer months that have something to show.
  const { data: first } = await db().from("class_sessions").select("starts_at").order("starts_at").limit(1).maybeSingle();
  const firstMonth = first ? first.starts_at.slice(0, 7) : thisMonth;
  const months: string[] = [];
  for (let k = `${thisMonth}-01`; k.slice(0, 7) >= firstMonth && months.length < 60; ) {
    months.push(k.slice(0, 7));
    const [y, m] = k.split("-").map(Number);
    k = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
  }
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
  const month = q.month && months.includes(q.month) ? q.month : thisMonth;
  const year = q.year && years.includes(Number(q.year)) ? Number(q.year) : thisYear;
  const show: Measure = MEASURES.some((m) => m.value === q.show) ? (q.show as Measure) : "revenue";

  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDaysKey(today, -dow);
  const monthKey = `${month}-01`;
  const wFrom = localToUtc(weekStart, "00:00"), wTo = localToUtc(addDaysKey(weekStart, 7), "00:00");
  const mFrom = localToUtc(monthKey, "00:00"), mTo = localToUtc(nextMonth(monthKey), "00:00");

  const sel = "starts_at, capacity, class_types(kind, credit_kind), bookings!bookings_session_id_fkey(status, checked_in_at)";
  const [{ data: week }, { data: monthRows }, { data: monthPay }, { count: newClients }, { data: yearPayments }, { data: monthLedger }, { data: board }] = await Promise.all([
    db().from("class_sessions").select(sel).eq("status", "scheduled").gte("starts_at", wFrom).lt("starts_at", wTo),
    db().from("class_sessions").select(sel).eq("status", "scheduled").gte("starts_at", mFrom).lt("starts_at", mTo),
    db().from("payments").select("amount_cents, purpose, products(credit_kind, tag)").eq("status", "paid").gte("paid_at", mFrom).lt("paid_at", mTo),
    db().from("profiles").select("id", { count: "exact", head: true }).eq("role", "client").is("deleted_at", null).gte("created_at", mFrom).lt("created_at", mTo),
    db().rpc("payments_by_method", { p_year: year }),
    db().from("credit_ledger").select("delta, entry_type").gte("created_at", mFrom).lt("created_at", mTo),
    db().rpc("stats_months", { p_year: year }),
  ]);
  const W = (week ?? []) as S[], M = (monthRows ?? []) as S[];
  const revenue = (monthPay ?? []).reduce((n, p) => n + p.amount_cents, 0);
  const monthName = monthYear(`${monthKey}T12:00:00Z`);
  const isThisMonth = month === thisMonth;

  // Reformer vs mat, the chosen month.
  // Reformer vs Mat (and any class type she added with its own packages that had classes or sales).
  const allKinds = await getKinds();
  const shown = allKinds.filter((k) => k.key === "reformer" || k.key === "mat" || M.some((s) => s.class_types?.credit_kind === k.key) || (monthPay ?? []).some((p) => p.products?.credit_kind === k.key));
  const kinds = shown.map(({ key: k, label }) => {
    const list = M.filter((s) => s.class_types?.kind !== "event" && s.class_types?.credit_kind === k);
    const pays = (monthPay ?? []).filter((p) => p.products?.credit_kind === k);
    return {
      k, label, classes: list.length, booked: booked(list), spots: spots(list),
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

  // Package classes: used in the month (booked minus returned) and left to expire unused.
  const sum = (t: string) => (monthLedger ?? []).filter((e) => e.entry_type === t).reduce((n, e) => n + e.delta, 0);
  const used = -sum("booking_debit") - sum("cancel_refund");
  const expired = -sum("expiry");

  // The year board: one bar per month for the chosen measure.
  const shortMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" });
  const rows = (board ?? []).map((r) => {
    const value = show === "revenue" ? r.revenue_cents : show === "packs" ? r.packs_sold : show === "bookings" ? r.booked
      : show === "clients" ? r.new_clients : r.spots ? Math.round((r.booked / r.spots) * 100) : 0;
    const empty = show === "fill" ? !r.spots : show === "bookings" ? !r.classes : false;
    const future = `${year}-${pad(r.month)}` > thisMonth;
    const label = show === "revenue" ? eur(r.revenue_cents) : show === "fill" ? `${value}% · ${r.booked}/${r.spots}` : show === "bookings" ? `${r.booked} of ${r.spots}` : String(value);
    return { ...r, value, empty: empty || (future && !value), future, label, name: shortMonth.format(new Date(Date.UTC(year, r.month - 1, 15))) };
  });
  const max = show === "fill" ? 100 : Math.max(1, ...rows.map((r) => r.value));
  const total = (board ?? []).reduce((t, r) => ({ rev: t.rev + Number(r.revenue_cents), packs: t.packs + r.packs_sold, b: t.b + r.booked, s: t.s + r.spots, c: t.c + r.new_clients }), { rev: 0, packs: 0, b: 0, s: 0, c: 0 });
  const totalLabel = show === "revenue" ? eur(total.rev) : show === "packs" ? `${total.packs} packages` : show === "fill" ? `${pct(total.b, total.s)} of ${total.s} spots`
    : show === "bookings" ? `${total.b} of ${total.s} spots` : `${total.c} new clients`;

  const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Nicosia", month: "short" });
  const table = new Map<string, Map<string, number>>();
  for (const p of yearPayments ?? []) {
    const mo = monthFmt.format(new Date(`${p.month}-01T12:00:00Z`));
    const meth = METHOD[p.method] ?? p.method ?? "Other";
    const row = table.get(mo) ?? new Map(); row.set(meth, (row.get(meth) ?? 0) + Number(p.total_cents)); table.set(mo, row);
  }
  const methods = [...new Set([...table.values()].flatMap((r) => [...r.keys()]))];
  const wb = booked(W), ws = spots(W), mb = booked(M), ms = spots(M);
  const monthOptions = months.map((m) => ({ value: m, label: monthYear(`${m}-15T12:00:00Z`) }));

  return (
    <div>
      <AdminTitle title="Stats" />

      <h2 className="display mb-2 text-[0.95rem]">This week</h2>
      <div className="grid grid-cols-2 gap-2">
        <Big label="Bookings" value={wb} after={`of ${ws} spots`} />
        <Big label="Fill rate" value={pct(wb, ws)} />
      </div>

      <section className="card mt-3 px-4 py-4" aria-labelledby="fill-heading">
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

      <section aria-labelledby="month-heading" className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="month-heading" className="display text-[0.95rem]">Month</h2>
          <div className="w-44"><Pick name="month" value={month} label="Choose a month" options={monthOptions} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Big label="Bookings" value={mb} after={`of ${ms} spots`} hint={isThisMonth ? "Includes classes still to come" : undefined} />
          <Big label="Fill rate" value={pct(mb, ms)} />
          <Big label="Revenue" value={eur(revenue)} hint="Everything marked as paid" />
          <Big label="New clients" value={newClients ?? 0} after="signed up" />
        </div>

        <div className="card mt-3 overflow-x-auto px-4 py-4">
          <h3 className="display mb-3 text-[0.95rem]">{kinds.length > 2 ? "By class type" : "Reformer vs mat"} · {monthName}</h3>
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
        </div>

        <div className="card mt-3 px-4 py-4">
          <h3 className="display mb-1 text-[0.95rem]">Package classes · {monthName}</h3>
          <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="font-serif text-3xl text-ink">{used}</span><span className="text-sm text-ink-soft">used</span><span className="ml-3 font-serif text-3xl text-ink">{expired}</span><span className="text-sm text-ink-soft">expired unused</span></p>
          <p className="mt-1 text-xs text-ink-soft">Classes taken from clients&apos; packages that month, and classes that ran out on their end date without being used.</p>
        </div>
      </section>

      <section aria-labelledby="year-heading" className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="year-heading" className="display text-[0.95rem]">Year</h2>
          <div className="w-28"><Pick name="year" value={String(year)} label="Choose a year" options={years.map((y) => ({ value: String(y), label: String(y) }))} /></div>
        </div>
        <div className="card px-4 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">Show</p>
            <div className="w-44"><Pick name="show" value={show} label="What to show for each month" options={MEASURES.map((m) => ({ ...m }))} /></div>
          </div>
          <ul className="space-y-2.5" aria-label={`${MEASURES.find((m) => m.value === show)!.label} by month, ${year}`}>
            {rows.map((r) => (
              <li key={r.month} className="grid grid-cols-[2.5rem_1fr_6.5rem] items-center gap-3 text-sm">
                <span className={r.future ? "text-ink-soft" : "text-ink"}>{r.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-lilac-50" aria-hidden>
                  <span className="block h-full rounded-full bg-lilac-300" style={{ width: `${r.empty ? 0 : Math.round((r.value / max) * 100)}%` }} />
                </span>
                <span className="text-right text-ink-soft">{r.empty ? "–" : r.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-sm text-ink"><span className="text-ink-soft">{year === thisYear ? `${year} so far` : `${year} total`}:</span> {totalLabel}</p>
        </div>

        <div className="card mt-3 overflow-x-auto px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="display text-[0.95rem]">Payments by method · {year}</h3>
            <a href={`/admin/export/payments?year=${year}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-3 text-sm text-ink">Export CSV</a>
          </div>
          <table className="w-full text-left text-sm">
            <thead><tr><th scope="col" className="py-1.5 font-medium">Month</th>{methods.map((mm) => <th key={mm} scope="col" className="py-1.5 text-right font-medium">{mm}</th>)}</tr></thead>
            <tbody>{[...table].map(([mo, row]) => <tr key={mo} className="border-t border-line"><td className="py-1.5">{mo}</td>{methods.map((mm) => <td key={mm} className="py-1.5 text-right text-ink-soft">{row.get(mm) ? eur(row.get(mm)!) : "–"}</td>)}</tr>)}</tbody>
          </table>
          {table.size === 0 && <p className="text-sm text-ink-soft">No payments in {year}.</p>}
        </div>
      </section>
    </div>
  );
}
