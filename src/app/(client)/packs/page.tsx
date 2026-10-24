import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Card, Notice, PageTitle, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { productPrice } from "@/lib/pricing";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { PackagePicker, type Group } from "./PackagePicker";
import type { PayMethod } from "./actions";

export const metadata: Metadata = { title: "Packages" };
export const dynamic = "force-dynamic";

export default async function PacksPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; type?: string }> }) {
  const { cancelled, type } = await searchParams;
  const kind = type === "mat" ? "mat" : "reformer";
  const [s, viewer, { data: products }] = await Promise.all([
    getSettings(),
    getViewer(),
    db().from("products").select("*").eq("active", true).order("sort_order"),
  ]);
  const all = products ?? [];
  const packs = all.filter((p) => p.tag === "package" && p.credit_kind === kind);
  const groups: Group[] = [...new Set(packs.map((p) => p.months ?? Math.round((p.validity_days ?? 30) / 30)))].sort().map((months) => ({
    months,
    options: packs.filter((p) => (p.months ?? Math.round((p.validity_days ?? 30) / 30)) === months).map((p) => {
      const price = productPrice(p, viewer?.profile ?? null, s);
      return { id: p.id, perWeek: p.per_week ?? Math.round(p.credits / 4 / months), credits: p.credits, cents: price.cents, listCents: p.price_cents, student: price.student, validityDays: p.validity_days ?? 30 * months };
    }),
  }));
  const singles = all.filter((p) => (p.tag === "trial" || p.tag === "drop_in") && p.credit_kind === kind);
  const methods: PayMethod[] = ["cash", "revolut", ...(s.bank_iban ? ["bank_transfer" as const] : [])];
  const label = kind === "reformer" ? "Reformer" : "Mat";

  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Packages" script="Your">
        Choose how often you&apos;d like to come. Validity starts from your first class.
      </PageTitle>
      {cancelled && <div className="mb-4 px-5"><Notice>Checkout cancelled. Nothing was charged.</Notice></div>}

      <nav aria-label="Class type" className="mb-5 px-5">
        <div className="grid grid-cols-2 rounded-full bg-lilac-100 p-1">
          {(["reformer", "mat"] as const).map((k) => (
            <Link key={k} href={k === "mat" ? "/packs?type=mat" : "/packs"} scroll={false} aria-current={k === kind ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center rounded-full text-[0.8rem] font-medium uppercase tracking-[0.16em] transition ${k === kind ? "bg-white text-ink shadow-[var(--shadow-soft)]" : "text-ink-soft"}`}>
              {k === "reformer" ? "Reformer" : "Mat"}
            </Link>
          ))}
        </div>
      </nav>

      <div className="space-y-8">
        <div className="px-5">
          {groups.length ? <PackagePicker key={kind} kind={label} groups={groups} methods={methods} online={s.online_payments_enabled} cutoff={s.cancellation_cutoff_hours} />
            : <Card className="px-5 py-6 text-sm text-ink-soft">{label} packages are coming soon.</Card>}
          {s.student_discount_pct > 0 && <p className="mt-3 text-xs leading-relaxed text-ink-soft">Students get {s.student_discount_pct}% off group packages: show your student card at the studio once and it&apos;s applied automatically.</p>}
        </div>

        {singles.length > 0 && (
          <Section title="Single classes">
            <Card className="divide-y divide-line px-5">
              {singles.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                  <div>
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-ink-soft">{p.tag === "trial" ? `Your first ${kind} class only` : "One class, paid individually"}</p>
                  </div>
                  <p className="font-serif text-2xl text-ink">{eur(p.price_cents)}</p>
                </div>
              ))}
              <p className="py-3 text-xs leading-relaxed text-ink-soft">Pick a class on the <Link href="/schedule" className="underline underline-offset-4">schedule</Link> and choose {singles.some((p) => p.tag === "trial") ? "Trial or Drop-in" : "Drop-in"}. Pay by cash or Revolut before class.</p>
            </Card>
          </Section>
        )}
      </div>
    </div>
  );
}
