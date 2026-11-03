import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Card, Notice, PageTitle, Section } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/auth";
import { productPrice } from "@/lib/pricing";
import { availableRewards } from "@/lib/rewards";
import { getKinds, getTabs } from "@/lib/kinds";
import { db } from "@/lib/supabase/admin";
import { eur } from "@/lib/money";
import { PackagePicker, type Group } from "./PackagePicker";
import type { PayMethod } from "./actions";

export const metadata: Metadata = { title: "Packages" };
export const dynamic = "force-dynamic";

export default async function PacksPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; type?: string }> }) {
  const { cancelled, type } = await searchParams;
  const [s, viewer, { data: products }, kinds] = await Promise.all([
    getSettings(),
    getViewer(),
    db().from("products").select("*").eq("active", true).is("archived_at", null).order("sort_order"),
    getKinds(),
  ]);
  const all = products ?? [];
  const tabsAll = await getTabs();
  const isAdmin = viewer?.profile.role === "admin";
  const offered = (k: string) => all.some((p) => p.credit_kind === k && (p.tag === "package" || p.tag === "trial" || p.tag === "drop_in"));
  const kindsIn = (tab: string) => kinds.filter((k) => k.tab === tab && offered(k.key));
  // Her tabs (Mat, Reformer, Pre and Post Natal, Private…) with something on sale. Hidden tabs: only she sees them, to check.
  const tabs = tabsAll.filter((t) => (t.visible || isAdmin) && kindsIn(t.key).length);
  // ?type= is a tab, or a class type (links from a class page go to the tab that holds it).
  const tab = tabs.find((t) => t.key === type) ?? tabs.find((t) => t.key === kinds.find((k) => k.key === type)?.tab) ?? tabs[0];
  const tabKinds = tab ? kindsIn(tab.key) : [];
  const many = tabKinds.length > 1;
  const rewards = viewer ? (await availableRewards(viewer.profile.id, "package")).map(({ id: _id, ...r }) => (void _id, r)) : [];
  const monthsOf = (p: (typeof all)[number]) => p.months ?? Math.round((p.validity_days ?? 30) / 30);
  const groups: Group[] = tabKinds.flatMap((k) => {
    const packs = all.filter((p) => p.tag === "package" && p.credit_kind === k.key);
    return [...new Set(packs.map(monthsOf))].sort().map((months, i) => ({
      key: `${k.key}-${months}`, months,
      title: many ? `${k.sub_label || k.label}${new Set(packs.map(monthsOf)).size > 1 ? ` · ${months} month${months === 1 ? "" : "s"}` : ""}` : `${k.label} packages`,
      heading: many && i === 0 ? k.sub_label || k.label : undefined,
      description: many && i === 0 ? k.description : undefined,
      options: packs.filter((p) => monthsOf(p) === months).map((p) => {
        const price = productPrice(p, viewer?.profile ?? null, s);
        return { id: p.id, perWeek: p.per_week ?? Math.round(p.credits / 4 / months), credits: p.credits, cents: price.cents, listCents: p.price_cents, student: price.student, validityDays: p.validity_days ?? 30 * months, kindLabel: k.label };
      }),
    }));
  });
  const singles = all.filter((p) => (p.tag === "trial" || p.tag === "drop_in") && tabKinds.some((k) => k.key === p.credit_kind));
  const methods: PayMethod[] = ["cash", "revolut", ...(s.bank_iban ? ["bank_transfer" as const] : [])];
  const label = tab?.label ?? "";
  const kindLabelOf = (key: string | null) => kinds.find((k) => k.key === key)?.label ?? "";

  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Packages" script="Your">
        Choose how often you&apos;d like to come. Validity starts from your first class.
      </PageTitle>
      {cancelled && <div className="mb-4 px-5"><Notice>Checkout cancelled. Nothing was charged.</Notice></div>}

      <nav aria-label="Class type" className="mb-5 px-5">
        <div className="grid grid-cols-2 gap-1 rounded-[1.4rem] bg-lilac-100 p-1">
          {tabs.map((t) => (
            <Link key={t.key} href={`/packs?type=${t.key}`} scroll={false} aria-current={t.key === tab?.key ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center rounded-full px-3 text-center text-[0.72rem] font-medium uppercase leading-tight tracking-[0.14em] transition ${t.key === tab?.key ? "bg-white text-ink shadow-[var(--shadow-soft)]" : "text-ink-soft"} ${tabs.length % 2 && t === tabs.at(-1) ? "col-span-2" : ""}`}>
              {t.label}{!t.visible && " · hidden"}
            </Link>
          ))}
        </div>
      </nav>

      <div className="space-y-8">
        <div className="px-5">
          {tab && !tab.visible && <div className="mb-4"><Notice>Only you can see this tab. Show it to clients in Settings → Packages page.</Notice></div>}
          {tab?.note && <p className="mb-4 rounded-2xl bg-mauve-soft px-4 py-3 text-sm leading-relaxed text-ink">{tab.note}</p>}
          {groups.length ? <PackagePicker key={tab?.key} groups={groups} methods={methods} online={s.online_payments_enabled} cutoff={s.cancellation_cutoff_hours} rewards={rewards} signedIn={!!viewer} />
            : singles.length ? null : <Card className="px-5 py-6 text-sm text-ink-soft">{label} packages are coming soon.</Card>}
          {s.student_discount_pct > 0 && <p className="mt-3 text-xs leading-relaxed text-ink-soft">Students get {s.student_discount_pct}% off group packages: show your student card at the studio once and it&apos;s applied automatically.</p>}
        </div>

        {singles.length > 0 && (
          <Section title={many ? `Single classes · ${label}` : "Single classes"}>
            <Card className="divide-y divide-line px-5">
              {singles.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                  <div>
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-ink-soft">{p.description || (p.tag === "trial" ? `Your first ${kindLabelOf(p.credit_kind).toLowerCase()} class only` : "One class, paid individually")}</p>
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
