import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Badge, Button, ButtonLink, Card, Notice, PageTitle, Section } from "@/components/ui";
import { getSettings, requireViewer } from "@/lib/auth";
import { creditBalance } from "@/lib/data";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { dayMonth, longDate } from "@/lib/time";
import { toggleRenewal } from "./actions";
import { paymentReference } from "@/lib/pricing";

export const metadata: Metadata = { title: "Membership" };
export const dynamic = "force-dynamic";

const ENTRY: Record<string, string> = {
  grant: "Added", booking_debit: "Booked", cancel_refund: "Returned", expiry: "Expired", admin_adjustment: "Adjusted by studio", rollover: "Rolled over",
};

export default async function MembershipPage({ searchParams }: { searchParams: Promise<{ requested?: string; started?: string }> }) {
  const { requested, started } = await searchParams;
  const viewer = await requireViewer("/membership");
  const p = viewer.profile;
  const settings = await getSettings();
  const { data: lots } = await db().from("credit_lots").select("id, note, credit_kind, remaining, total, started_at, expires_at, validity_days")
    .eq("profile_id", p.id).gt("remaining", 0).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at");
  const [credits, { data: m }, { data: pending }, { data: ledger }, { data: payments }] = await Promise.all([
    creditBalance(p.id),
    db().from("memberships").select("*, products!memberships_product_id_fkey(name, credits, credit_kind, price_cents), next:products!memberships_next_product_id_fkey(name)")
      .eq("profile_id", p.id).in("status", ["active", "paused", "past_due"]).maybeSingle(),
    db().from("payments").select("id, description, amount_cents, created_at, booking_id").eq("profile_id", p.id).eq("status", "pending").eq("provider", "offline"),
    db().from("credit_ledger").select("id, delta, entry_type, credit_kind, created_at, note, bookings(class_sessions(starts_at, title, class_types(name)))")
      .eq("profile_id", p.id).order("created_at", { ascending: false }).limit(25),
    db().from("payments").select("id, description, amount_cents, paid_at, method").eq("profile_id", p.id).eq("status", "paid").order("paid_at", { ascending: false }).limit(12),
  ]);
  const kind = m?.products?.credit_kind ?? "reformer";
  const left = credits[kind];

  return (
    <div>
      <PageTitle eyebrow="Your package" title="Membership" />
      <div className="space-y-6">
        {requested && <div className="px-5"><Notice tone="success">Request noted. Once your payment is received, your classes are added straight away.</Notice></div>}
        {started && <div className="px-5"><Notice tone="success">Welcome! Your classes are ready to book.</Notice></div>}

        <section className="px-5" aria-labelledby="current">
          <Card className="overflow-hidden">
            <div className="lilac-wash px-5 py-6">
              <p className="eyebrow" id="current">{m ? "Current package" : "Classes"}</p>
              <p className="mt-2 font-serif text-[2.6rem] leading-none text-ink">{left}</p>
              <p className="mt-1 text-[0.95rem] text-ink">
                {kind} class{left === 1 ? "" : "es"} left
                {m && m.status === "active" && ` · ${m.cancel_at_period_end ? "ends" : m.provider === "stripe" ? "renews" : "renewal due"} ${dayMonth(m.current_period_end)}`}
              </p>
              {credits.mat > 0 && kind !== "mat" && <p className="mt-1 text-sm text-ink-soft">+ {credits.mat} mat class{credits.mat === 1 ? "" : "es"}</p>}
            </div>
            <div className="space-y-3 px-5 py-4">
              {m ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-ink">{m.products?.name}</p>
                    <Badge tone={m.status === "active" ? "lilac" : m.status === "paused" ? "plain" : "full"}>{m.status === "past_due" ? "Payment due" : m.status}</Badge>
                  </div>
                  <p className="text-sm text-ink-soft">
                    {m.products?.credits} classes per period · {eur(m.products?.price_cents ?? 0)} · current period {dayMonth(m.current_period_start)}–{dayMonth(m.current_period_end)}
                    {m.next ? ` · changes to ${m.next.name} next period` : ""}
                  </p>
                  {m.provider === "stripe" && settings.online_payments_enabled ? (
                    <form action="/api/stripe/portal" method="post">
                      <Button type="submit" variant="ghost" className="w-full">Update card or cancel renewal</Button>
                    </form>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-ink-soft">Renew at the studio by cash or card. We&apos;ll remind you 3 days before. To change package, just tell us at your next class.</p>
                      <form action={toggleRenewal.bind(null, m.id, !m.cancel_at_period_end)}>
                        <Button type="submit" variant="ghost" className="w-full">{m.cancel_at_period_end ? "I'd like to keep renewing" : "Don't renew after this period"}</Button>
                      </form>
                    </>
                  )}
                </>
              ) : (
                <>
                  {(lots ?? []).length > 0 ? (
                    <ul className="divide-y divide-line text-sm">
                      {lots!.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3 py-2">
                          <span className="text-ink">{(l.note ?? l.credit_kind).replace(/ \(.*\)$/, "")}<span className="block text-xs text-ink-soft">{l.remaining} of {l.total} left</span></span>
                          <span className="text-right text-xs text-ink-soft">
                            {l.validity_days && !l.started_at ? <>Not started yet<br />{l.validity_days} days from your first class</>
                              : l.expires_at ? <>{l.started_at && l.started_at > new Date().toISOString() ? "Provisional · " : ""}valid until<br />{longDate(new Date(new Date(l.expires_at).getTime() - 1))}</> : "No expiry"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-soft">No package yet. A package is the easiest way to keep your rhythm.</p>
                  )}
                  <ButtonLink href="/packs" variant={(lots ?? []).length ? "ghost" : "primary"} className="w-full">{(lots ?? []).length ? "Get another package" : "See packages"}</ButtonLink>
                </>
              )}
            </div>
          </Card>
        </section>

        {(pending ?? []).length > 0 && (
          <Section title="Awaiting payment">
            <ul className="card divide-y divide-line">
              {pending!.map((x) => (
                <li key={x.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink">{x.description}<span className="block text-ink-soft">Requested {dayMonth(x.created_at)} · held for {settings.unpaid_request_expiry_hours}h</span></span>
                    <span className="font-serif text-xl text-ink">{eur(x.amount_cents)}</span>
                  </div>
                  {!x.booking_id && (
                    <div className="rounded-2xl bg-lilac-50 px-3 py-2.5 leading-relaxed text-ink">
                      <p>Pay in advance by <strong className="font-medium">cash at the studio</strong>{settings.revolut_link ? <>, <strong className="font-medium">Revolut</strong></> : null}{settings.bank_iban ? <> or <strong className="font-medium">bank transfer</strong></> : null}.</p>
                      {settings.bank_iban && <p className="mt-1 text-xs">{settings.bank_account_name || "Re·Form Pilates Studio"} · IBAN <span className="font-mono">{settings.bank_iban}</span></p>}
                      <p className="mt-1 text-xs">Reference: <strong className="font-mono font-medium">{paymentReference(x.id)}</strong></p>
                      {settings.revolut_link && <a href={settings.revolut_link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-xs font-medium uppercase tracking-[0.14em] text-paper">Pay with Revolut</a>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Class history">
          <ul className="card divide-y divide-line">
            {(ledger ?? []).map((e) => {
              const s = e.bookings?.class_sessions;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block text-ink">{ENTRY[e.entry_type]}{s ? `: ${s.title ?? s.class_types?.name}, ${longDate(s.starts_at)}` : e.note ? `: ${e.note}` : ""}</span>
                    <span className="text-xs text-ink-soft">{dayMonth(e.created_at)}</span>
                  </span>
                  <span className={`shrink-0 font-medium ${e.delta > 0 ? "text-plum-700" : "text-ink-soft"}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
                </li>
              );
            })}
            {(ledger ?? []).length === 0 && <li className="px-4 py-4 text-sm text-ink-soft">No classes yet.</li>}
          </ul>
        </Section>

        {(payments ?? []).length > 0 && (
          <Section title="Receipts">
            <ul className="card divide-y divide-line">
              {payments!.map((x) => (
                <li key={x.id}>
                  <Link href={`/receipts/${x.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-lilac-50">
                    <span className="flex items-center gap-2 text-ink"><Receipt aria-hidden size={15} />{x.description}</span>
                    <span className="text-ink-soft">{eur(x.amount_cents)} · {x.paid_at ? dayMonth(x.paid_at) : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
