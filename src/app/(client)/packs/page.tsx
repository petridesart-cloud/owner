import type { Metadata } from "next";
import { Card, Notice, PageTitle, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { productPrice } from "@/lib/pricing";
import { db } from "@/lib/supabase/admin";
import { eur, vatLine } from "@/lib/money";
import { BuyButton } from "./BuyButton";

export const metadata: Metadata = { title: "Packages" };
export const dynamic = "force-dynamic";

export default async function PacksPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  const [s, viewer, { data: products }, { data: types }] = await Promise.all([
    getSettings(),
    getViewer(),
    db().from("products").select("*").eq("active", true).in("kind", ["membership", "pack"]).order("sort_order"),
    db().from("class_types").select("name, credit_kind, price_cents").eq("active", true).not("credit_kind", "is", null).order("sort_order"),
  ]);
  const single = (k: string | null) => types?.find((t) => t.credit_kind === k)?.price_cents ?? 0;
  const online = s.online_payments_enabled;
  const monthly = (products ?? []).filter((p) => p.kind === "membership");
  const packs = (products ?? []).filter((p) => p.kind === "pack");
  const period = s.membership_period_mode === "calendar" ? "calendar month" : "30 days";

  const card = (p: NonNullable<typeof products>[number]) => {
    const price = productPrice(p, viewer?.profile ?? null, s);
    const per = Math.round(price.cents / p.credits);
    const saving = single(p.credit_kind) * p.credits - price.cents;
    const isMonthly = p.kind === "membership";
    const vat = vatLine(p.price_cents, Number(s.vat_rate), s.vat_registered);
    const terms = isMonthly ? (
      <ul className="list-disc space-y-1 pl-4">
        <li><strong className="font-medium">{eur(p.price_cents)}</strong> for {p.credits} {p.credit_kind} classes every {period}.</li>
        <li>Classes expire at the end of each period{s.rollover_max ? `; up to ${s.rollover_max} unused roll over once` : " and don't roll over"}.</li>
        {online ? (
          <li>Renews automatically. Cancel or update your card any time from your Membership page, effective at the end of the period.</li>
        ) : (
          <li>Pay at the studio (cash or card). No automatic renewal; we&apos;ll remind you to renew.</li>
        )}
        <li>Classes have no cash value and can&apos;t be transferred.</li>
      </ul>
    ) : (
      <ul className="list-disc space-y-1 pl-4">
        <li><strong className="font-medium">{eur(price.cents)}</strong>{price.student ? " (student price)" : ""} for {p.credits} {p.credit_kind} classes, valid {p.validity_days} days from the date of your first class.</li>
        <li>Classes can&apos;t be booked after the expiry date; unused classes expire and are non-refundable.</li>
        <li>{online ? "Paid now by secure checkout." : "Paid in advance by cash, Revolut or bank transfer. Your classes are added once it's received."}</li>
        <li>Personal: packages can&apos;t be shared or transferred.</li>
      </ul>
    );
    return (
      <li key={p.id}>
        <Card className="px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{isMonthly ? `Every ${period}` : `${p.credits} classes · valid ${p.validity_days} days`}</p>
              <h3 className="display mt-2 text-[1.1rem] text-ink">{p.name.replace(/^Monthly · /, "")}</h3>
              <p className="mt-1 text-sm text-ink-soft">{p.description ?? ""} {eur(per)} per class.</p>
            </div>
            <div className="text-right">
              {price.student && <p className="text-xs text-ink-soft line-through">{eur(p.price_cents)}</p>}
              <p className="font-serif text-3xl text-ink">{eur(price.cents)}</p>
              {price.student && <p className="text-xs font-medium text-plum-700">Student price</p>}
              {isMonthly && <p className="text-xs text-ink-soft">per {s.membership_period_mode === "calendar" ? "month" : "30 days"}</p>}
              {saving > 0 && <p className="text-xs font-medium text-plum-700">Save {eur(saving)}</p>}
              {vat && <p className="text-xs text-ink-soft">{vat}</p>}
            </div>
          </div>
          <BuyButton productId={p.id} label={`${online ? "Buy" : "Request"} ${p.name} for ${eur(price.cents)}`} terms={terms}
            cta={online ? (isMonthly ? "Start membership" : "Buy package") : "Request package"} />
        </Card>
      </li>
    );
  };

  return (
    <div>
      <PageTitle eyebrow="Classes your way" title="Packages">
        Credits work for their class type (reformer or mat). Special events are paid individually.
      </PageTitle>
      {cancelled && <div className="mb-4 px-5"><Notice>Checkout cancelled. Nothing was charged.</Notice></div>}
      {!online && (
        <div className="mb-5 px-5"><Notice>All packages are paid in advance by cash at the studio, Revolut or bank transfer. Request one here and your classes appear as soon as payment is received. Validity starts from your first class.{s.student_discount_pct ? ` Students get ${s.student_discount_pct}% off group packages (show your student card at the studio).` : ""}</Notice></div>
      )}
      <div className="space-y-8">
        {monthly.length > 0 && <Section title="Monthly"><ul className="grid gap-3">{monthly.map(card)}</ul></Section>}
        {packs.length > 0 && <Section title="Packages"><ul className="grid gap-3">{packs.map(card)}</ul></Section>}
        <Section title="Single class">
          <Card className="px-5 py-4 text-sm text-ink-soft">
            {(types ?? []).map((t) => <p key={t.name} className="flex justify-between py-1"><span className="text-ink">{t.name}</span><span className="font-serif text-xl text-ink">{eur(t.price_cents)}</span></p>)}
            <p className="mt-2">{online ? "Book any class from the schedule and pay when you book." : s.allow_pay_later ? "Book from the schedule and pay at the studio." : "Paid in advance: ask at the studio or message us to book a single class."}</p>
          </Card>
        </Section>
      </div>
    </div>
  );
}
