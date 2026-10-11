import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard, Lock } from "lucide-react";
import { Button, Eyebrow } from "@/components/ui";
import { getSettings, requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { eur, vatLine } from "@/lib/money";
import { abandonMockPayment, completeMockPayment } from "./actions";

export const metadata: Metadata = { title: "Test checkout" };

export default async function MockCheckout({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const viewer = await requireViewer("/");
  if (!payment) notFound();
  const { data: pay } = await db().from("payments").select("*").eq("id", payment).eq("profile_id", viewer.profile.id).maybeSingle();
  if (!pay || pay.status !== "pending") notFound();
  const settings = await getSettings();

  return (
    <div className="px-5 pt-8">
      <div className="card animate-rise mx-auto max-w-md px-6 py-7">
        <Eyebrow>Test checkout · no real payment</Eyebrow>
        <h1 className="display mt-3 text-[1.4rem] text-ink">Confirm &amp; pay</h1>
        <div className="mt-5 rounded-2xl bg-lilac-50 p-4">
          <p className="text-sm text-ink">{pay.description}</p>
          <p className="mt-3 flex items-baseline justify-between"><span className="text-sm text-ink-soft">Total</span><span className="font-serif text-3xl text-ink">{eur(pay.amount_cents)}</span></p>
          {vatLine(pay.amount_cents, Number(settings.vat_rate), settings.vat_registered) && <p className="text-right text-xs text-ink-soft">{vatLine(pay.amount_cents, Number(settings.vat_rate), settings.vat_registered)}</p>}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          In the live app this step is Stripe&apos;s secure checkout with card, Apple Pay and Google Pay. Card details never reach Re·Form.
        </p>
        <form action={completeMockPayment.bind(null, pay.id)} className="mt-5">
          <Button type="submit" className="w-full"><CreditCard aria-hidden size={18} /> Pay {eur(pay.amount_cents)} (test)</Button>
        </form>
        <form action={abandonMockPayment.bind(null, pay.id)} className="mt-2">
          <Button type="submit" variant="ghost" className="w-full">Cancel</Button>
        </form>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-soft"><Lock aria-hidden size={12} /> Simulated payment for the demo</p>
      </div>
    </div>
  );
}
