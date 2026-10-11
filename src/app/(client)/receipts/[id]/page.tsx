import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getSettings, requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { longDate, time } from "@/lib/time";

export const metadata: Metadata = { title: "Receipt" };

const METHOD: Record<string, string> = { online: "Online (card)", cash: "Cash", card_in_person: "Card at the studio", bank_transfer: "Bank transfer" };

// A plain payment confirmation. Not a tax invoice: no VAT or registration numbers
// until the studio is registered (Settings keeps those fields for later).
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("/membership");
  const { data: pay } = await db().from("payments").select("*").eq("id", id).maybeSingle();
  if (!pay || (pay.profile_id !== viewer.profile.id && viewer.profile.role !== "admin") || pay.status !== "paid") notFound();
  const s = await getSettings();
  const { data: client } = await db().from("profiles").select("full_name, email").eq("id", pay.profile_id!).single();
  return (
    <div className="px-5 pt-8">
      <article className="card mx-auto max-w-md px-6 py-7 print:shadow-none">
        <div className="flex items-center justify-between">
          <Logo size={56} decorative />
          <p className="display text-[1.2rem] text-ink">Receipt</p>
        </div>
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Receipt no.</dt><dd className="text-ink">{pay.id.slice(0, 8).toUpperCase()}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Date</dt><dd className="text-ink">{longDate(pay.paid_at!)} · {time(pay.paid_at!)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Client</dt><dd className="text-ink">{client?.full_name ?? client?.email}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Paid by</dt><dd className="text-ink">{METHOD[pay.method ?? "online"]}</dd></div>
        </dl>
        <div className="mt-6 flex items-baseline justify-between border-y border-line py-4">
          <span className="text-ink">{pay.description}</span>
          <span className="font-serif text-2xl text-ink">{eur(pay.amount_cents)}</span>
        </div>
        {s.vat_registered && pay.vat_cents > 0 && <p className="mt-2 text-right text-xs text-ink-soft">incl. VAT {eur(pay.vat_cents)} · VAT no. {s.vat_number}</p>}
        <address className="mt-6 text-xs not-italic leading-relaxed text-ink-soft">
          {s.legal_name}{s.trader_name ? ` · ${s.trader_name}` : ""}<br />{s.address}<br />{s.contact_email} · {s.contact_phone}
        </address>
        <p className="mt-4 text-xs text-ink-soft">Payment confirmation. Thank you for practising with us.</p>
      </article>
    </div>
  );
}
