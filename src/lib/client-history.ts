import "server-only";
import { db } from "@/lib/supabase/admin";

export type Kind = "reformer" | "mat";
export type ClassStatus = "attended" | "no_show" | "late_cancel" | "cancelled" | "upcoming" | "unmarked" | "studio_cancelled";

export const STATUS_LABEL: Record<ClassStatus, string> = {
  attended: "Attended", no_show: "No-show", late_cancel: "Cancelled late (not refunded)", cancelled: "Cancelled (refunded)",
  upcoming: "Booked", unmarked: "Not marked", studio_cancelled: "Cancelled by studio",
};

export type ClassRow = { bookingId: string; sessionId: string | null; startsAt: string; name: string; status: ClassStatus };
export type Group = {
  key: string; kind: Kind | "event"; title: string; total: number | null; remaining: number | null;
  startsAt: string | null; endsAt: string | null; paidCents: number | null; paidAt: string | null; method: string | null;
  current: boolean; classes: ClassRow[];
};

/** What happened to one booking, in her words. */
function statusOf(b: { status: string; checked_in_at: string | null }, startsAt: string, now: string): ClassStatus {
  if (b.checked_in_at) return "attended";
  if (b.status === "no_show") return "no_show";
  if (b.status === "late_cancelled") return "late_cancel";
  if (b.status === "studio_cancelled") return "studio_cancelled";
  if (b.status === "cancelled") return "cancelled";
  return startsAt > now ? "upcoming" : "unmarked";
}

export const tally = (rows: ClassRow[]) => ({
  attended: rows.filter((r) => r.status === "attended").length,
  missed: rows.filter((r) => r.status === "no_show" || r.status === "late_cancel").length,
  noShow: rows.filter((r) => r.status === "no_show").length,
  late: rows.filter((r) => r.status === "late_cancel").length,
  cancelled: rows.filter((r) => r.status === "cancelled" || r.status === "studio_cancelled").length,
  upcoming: rows.filter((r) => r.status === "upcoming").length,
  unmarked: rows.filter((r) => r.status === "unmarked").length,
});

/**
 * A client's packages (each with the classes booked from it, via the ledger), plus trials,
 * drop-ins and events as their own entries. Newest first.
 */
export async function clientHistory(profileId: string) {
  const now = new Date().toISOString();
  const [{ data: lots }, { data: ledger }, { data: bookings }] = await Promise.all([
    db().from("credit_lots").select("id, credit_kind, total, remaining, expires_at, started_at, created_at, note, payment_id, membership_id, payments(amount_cents, paid_at, method, description, products(name))")
      .eq("profile_id", profileId).order("created_at", { ascending: false }),
    db().from("credit_ledger").select("lot_id, booking_id, entry_type").eq("profile_id", profileId).eq("entry_type", "booking_debit"),
    db().from("bookings").select("id, status, checked_in_at, paid_with, class_sessions(id, starts_at, title, class_types(name, kind)), payment:payments!bookings_payment_id_fkey(amount_cents, paid_at, method, status, products(tag, name))")
      .eq("profile_id", profileId).neq("status", "expired").neq("status", "held"),
  ]);
  const lotOf = new Map<string, string>();
  for (const e of ledger ?? []) if (e.booking_id && e.lot_id) lotOf.set(e.booking_id, e.lot_id);

  const row = (b: NonNullable<typeof bookings>[number]): ClassRow => {
    const s = b.class_sessions;
    const startsAt = s?.starts_at ?? "";
    return { bookingId: b.id, sessionId: s?.id ?? null, startsAt, name: s?.title ?? s?.class_types?.name ?? "Class", status: statusOf(b, startsAt, now) };
  };

  const groups: Group[] = (lots ?? []).map((l) => {
    const classes = (bookings ?? []).filter((b) => lotOf.get(b.id) === l.id).map(row).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const live = l.remaining > 0 && (!l.expires_at || l.expires_at > now);
    const started = !l.expires_at || l.expires_at > now;
    return {
      key: l.id, kind: l.credit_kind, title: l.payments?.products?.name ?? l.payments?.description ?? l.note ?? `${l.credit_kind} classes`,
      total: l.total, remaining: l.remaining, startsAt: l.started_at, endsAt: l.expires_at,
      paidCents: l.payments?.amount_cents ?? null, paidAt: l.payments?.paid_at ?? null, method: l.payments?.method ?? null,
      current: live || (started && classes.some((c) => c.status === "upcoming")), classes,
    };
  });

  // Trials, drop-ins and events: one entry each. Classes the studio added by hand: one entry per type.
  const manual = new Map<string, Group>();
  for (const b of bookings ?? []) {
    if (lotOf.has(b.id) || b.paid_with === "credit") continue;
    const s = b.class_sessions;
    const tag = b.payment?.products?.tag;
    const kind = (s?.class_types?.kind ?? "event") as Kind | "event";
    const r = row(b);
    if (!b.payment && kind !== "event") {
      const g = manual.get(kind) ?? {
        key: `manual-${kind}`, kind, title: `${s?.class_types?.name ?? "Classes"} · added by the studio`, total: null, remaining: null,
        startsAt: null, endsAt: null, paidCents: null, paidAt: null, method: null, current: false, classes: [],
      };
      g.classes.push(r);
      manual.set(kind, g);
      continue;
    }
    const title = tag === "trial" ? `Trial · ${s?.class_types?.name ?? "class"}` : tag === "drop_in" ? `Drop-in · ${s?.class_types?.name ?? "class"}` : `Event · ${s?.title ?? "Event"}`;
    groups.push({
      key: b.id, kind, title, total: null, remaining: null, startsAt: r.startsAt, endsAt: null,
      paidCents: b.payment?.status === "paid" ? b.payment.amount_cents : null, paidAt: b.payment?.status === "paid" ? b.payment.paid_at : null, method: b.payment?.method ?? null,
      current: r.status === "upcoming", classes: [r],
    });
  }
  for (const g of manual.values()) {
    g.classes.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    g.startsAt = g.classes[0]?.startsAt ?? null;
    g.current = g.classes.some((c) => c.status === "upcoming");
    groups.push(g);
  }
  groups.sort((a, b) => (b.startsAt ?? b.classes[0]?.startsAt ?? "9999").localeCompare(a.startsAt ?? a.classes[0]?.startsAt ?? "9999"));

  // Totals by type for the three boxes (events aside).
  const all = (bookings ?? []).map((b) => ({ kind: b.class_sessions?.class_types?.kind, r: row(b) }));
  const count = (kind: Kind, st: ClassStatus[]) => all.filter((x) => x.kind === kind && st.includes(x.r.status)).length;
  const packages = (kind: Kind) => (lots ?? []).filter((l) => l.credit_kind === kind && (l.payment_id || l.membership_id)).length;
  const totals = {
    packages: { reformer: packages("reformer"), mat: packages("mat") },
    attended: { reformer: count("reformer", ["attended"]), mat: count("mat", ["attended"]) },
    noShows: { reformer: count("reformer", ["no_show", "late_cancel"]), mat: count("mat", ["no_show", "late_cancel"]) },
  };
  return { groups, totals };
}
