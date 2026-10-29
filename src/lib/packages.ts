import "server-only";
import { db } from "@/lib/supabase/admin";

export type PackageClass = { bookingId: string; startsAt: string; name: string; status: "upcoming" | "attended" | "missed" };
export type PackageView = {
  id: string; title: string; subtitle: string; kind: "reformer" | "mat";
  total: number; remaining: number; used: number; attended: number; missed: number; expired: number;
  startedAt: string | null; expiresAt: string | null; validityDays: number | null;
  current: boolean; classes: PackageClass[];
};

const months = (m: number) => `${m} month${m === 1 ? "" : "s"}`;

/**
 * The client's packages (credit lots) with what happened to each class, for My classes.
 * Classes cancelled in time were rescheduled, so they're left out; late cancels and no-shows count as missed.
 */
export async function clientPackages(profileId: string, lotId?: string): Promise<PackageView[]> {
  let q = db().from("credit_lots")
    .select("id, credit_kind, total, remaining, started_at, expires_at, validity_days, note, created_at, payments(products(per_week, months, credits, validity_days))")
    .eq("profile_id", profileId).order("created_at", { ascending: false });
  if (lotId) q = q.eq("id", lotId);
  const { data: lots } = await q;
  if (!lots?.length) return [];

  const ids = lots.map((l) => l.id);
  const { data: ledger } = await db().from("credit_ledger")
    .select("lot_id, delta, entry_type, booking_id, bookings(status, checked_in_at, class_sessions(starts_at, title, class_types(name)))")
    .in("lot_id", ids);

  const now = Date.now();
  return lots.map((l) => {
    const rows = (ledger ?? []).filter((e) => e.lot_id === l.id);
    const byBooking = new Map<string, { net: number; b: (typeof rows)[number]["bookings"] }>();
    for (const e of rows) {
      if (!e.booking_id) continue;
      const cur = byBooking.get(e.booking_id) ?? { net: 0, b: e.bookings };
      cur.net += e.delta;
      byBooking.set(e.booking_id, cur);
    }
    const classes: PackageClass[] = [];
    for (const [bookingId, { net, b }] of byBooking) {
      const s = b?.class_sessions;
      if (net >= 0 || !b || !s) continue;
      const future = new Date(s.starts_at).getTime() > now;
      const status = b.status === "no_show" || b.status === "late_cancelled" ? "missed" : future && b.status === "confirmed" ? "upcoming" : "attended";
      classes.push({ bookingId, startsAt: s.starts_at, name: s.title ?? s.class_types?.name ?? "Class", status });
    }
    classes.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const expired = -rows.filter((e) => e.entry_type === "expiry").reduce((n, e) => n + e.delta, 0);
    const p = l.payments?.products;
    const kindLabel = l.credit_kind === "reformer" ? "Reformer" : "Mat";
    const title = `${kindLabel} Package`;
    const subtitle = p?.per_week && p.months
      ? `${p.credits ?? l.total} classes · ${months(p.months)}`
      : l.note?.split(" · ").slice(1).join(" · ") || `${l.total} classes`;
    const expiredOut = !!l.expires_at && new Date(l.expires_at).getTime() <= now;
    const upcoming = classes.some((c) => c.status === "upcoming");
    return {
      id: l.id, title, subtitle, kind: l.credit_kind, total: l.total, remaining: l.remaining,
      used: classes.length, attended: classes.filter((c) => c.status === "attended").length,
      missed: classes.filter((c) => c.status === "missed").length, expired,
      startedAt: l.started_at, expiresAt: l.expires_at, validityDays: l.validity_days,
      current: !expiredOut && (l.remaining > 0 || upcoming), classes,
    };
  });
}
