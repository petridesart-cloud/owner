import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { BackButton } from "@/components/BackButton";
import { PrintButton } from "@/components/PrintButton";
import { logoSrc } from "@/lib/media";
import { receiptLabel } from "@/lib/receipts";
import { business } from "@/lib/business";
import { getSettings, requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { dotDate, time } from "@/lib/time";

export const metadata: Metadata = { title: "Receipt" };

const METHOD: Record<string, string> = { online: "Online (card)", cash: "Cash", revolut: "Revolut", card_in_person: "Card at the studio", bank_transfer: "Bank transfer" };

// A plain payment confirmation. Not a tax invoice: no VAT or registration numbers
// until the studio is registered (Settings keeps those fields for later).
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("/account");
  const { data: pay } = await db().from("payments").select("*, products(tag, credit_kind, credits, months, per_week)").eq("id", id).maybeSingle();
  if (!pay || (pay.profile_id !== viewer.profile.id && viewer.profile.role !== "admin") || pay.status !== "paid") notFound();
  const s = await getSettings();
  const biz = business(s);
  const [{ data: client }, logo] = await Promise.all([db().from("profiles").select("full_name, email").eq("id", pay.profile_id!).single(), logoSrc()]);
  const pr = pay.products;
  const item = pr?.tag === "package" && pr.credit_kind
    ? `${pr.credit_kind === "reformer" ? "Reformer" : "Mat"} · ${pr.credits} classes / ${pr.months ?? 1} month${(pr.months ?? 1) > 1 ? "s" : ""}`
    : pay.description ?? receiptLabel(pay);
  return (
    <div className="px-5 pt-3">
      <div className="flex items-center justify-between print:hidden"><BackButton href="/account" /><PrintButton /></div>
      <article className="card mx-auto mt-2 max-w-md px-6 py-7 print:shadow-none">
        <div className="flex items-center justify-between">
          <Logo size={56} src={logo} decorative />
          <p className="display text-[1.2rem] text-ink">Receipt</p>
        </div>
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Receipt no.</dt><dd className="text-ink">{pay.id.slice(0, 8).toUpperCase()}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Date</dt><dd className="text-ink">{dotDate(pay.paid_at!)} · {time(pay.paid_at!)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Client</dt><dd className="text-ink">{client?.full_name ?? client?.email}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Paid by</dt><dd className="text-ink">{METHOD[pay.method ?? "online"]}</dd></div>
        </dl>
        <div className="mt-6 flex items-baseline justify-between border-y border-line py-4">
          <span className="text-ink">{item}</span>
          <span className="font-serif text-2xl text-ink">{eur(pay.amount_cents)}</span>
        </div>
        {s.vat_registered && pay.vat_cents > 0 && <p className="mt-2 text-right text-xs text-ink-soft">incl. VAT {eur(pay.vat_cents)} · VAT no. {s.vat_number}</p>}
        <address className="mt-6 text-xs not-italic leading-relaxed text-ink-soft">
          {biz.name}{biz.owner ? ` · ${biz.owner}` : ""}<br />{biz.address ?? "Limassol, Cyprus"}{(biz.email || biz.phone) && <><br />{[biz.email, biz.phone].filter(Boolean).join(" · ")}</>}
        </address>
        <p className="mt-4 text-xs text-ink-soft">Payment confirmation. Thank you for practising with us.</p>
      </article>
    </div>
  );
}
