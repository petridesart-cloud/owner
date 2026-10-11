import type { Metadata } from "next";
import { Card, Notice, PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { eur, vatLine } from "@/lib/money";
import { BuyButton } from "./BuyButton";

export const metadata: Metadata = { title: "Class packs" };
export const dynamic = "force-dynamic";

export default async function PacksPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  const [settings, { data: products }, { data: types }] = await Promise.all([
    getSettings(),
    db().from("products").select("*").eq("active", true).eq("kind", "pack").order("sort_order"),
    db().from("class_types").select("credit_kind, price_cents").eq("active", true).not("credit_kind", "is", null),
  ]);
  const single = (k: string | null) => types?.find((t) => t.credit_kind === k)?.price_cents ?? 0;

  return (
    <div>
      <PageTitle eyebrow="Save on every class" title="Class packs">
        Credits work for their own class type: reformer credits for Reformer, mat credits for Mat. Special events are paid individually.
      </PageTitle>
      {cancelled && <div className="mb-4 px-5"><Notice>Checkout cancelled. Nothing was charged.</Notice></div>}
      <ul className="grid gap-3 px-5">
        {(products ?? []).map((p) => {
          const per = Math.round(p.price_cents / p.credits);
          const saving = single(p.credit_kind) * p.credits - p.price_cents;
          return (
            <li key={p.id}>
              <Card className="px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">{p.credit_kind} · {p.credits} classes</p>
                    <h2 className="display mt-2 text-[1.15rem] text-ink">{p.name}</h2>
                    <p className="mt-1 text-sm text-ink-soft">{eur(per)} per class{p.validity_days ? ` · valid ${p.validity_days} days` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-3xl text-ink">{eur(p.price_cents)}</p>
                    {saving > 0 && <p className="text-xs font-medium text-plum-700">Save {eur(saving)}</p>}
                  </div>
                </div>
                <p className="mt-3 text-xs text-ink-soft">{vatLine(p.price_cents, Number(settings.vat_rate), settings.vat_registered)}. Unused credits expire after {p.validity_days} days and aren&apos;t refundable; see Terms.</p>
                <BuyButton productId={p.id} label={`Buy ${p.name} for ${eur(p.price_cents)}`} />
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
