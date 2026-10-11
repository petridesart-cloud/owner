import type { Metadata } from "next";
import Link from "next/link";
import { Download, LogOut } from "lucide-react";
import { Button, Card, Notice, PageTitle, Section, inputClass } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { longDate } from "@/lib/time";
import { deleteAccount, signOutAction } from "./actions";
import { HealthForm, ProfileForm } from "./Forms";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const CONSENT_LABEL: Record<string, string> = {
  policy: "Studio Rules", terms: "Terms & Conditions", fitness_declaration: "Health declaration",
  health_data: "Health data", marketing_email: "News by email", marketing_sms: "News by SMS",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ delete?: string }> }) {
  const { delete: del } = await searchParams;
  const viewer = await requireViewer("/account");
  const p = viewer.profile;
  const [{ data: health }, { data: consents }] = await Promise.all([
    db().from("health_notes").select("note").eq("profile_id", p.id).maybeSingle(),
    db().from("consents").select("type, granted, version, created_at").eq("profile_id", p.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const latest = new Map<string, { granted: boolean; created_at: string }>();
  for (const c of consents ?? []) if (!latest.has(c.type)) latest.set(c.type, c);

  return (
    <div>
      <PageTitle eyebrow={p.email ?? ""} title="Account" />
      <div className="space-y-8">
        <div className="px-5">
          <Link href="/membership" className="card flex min-h-14 items-center justify-between px-5 py-3 font-medium text-ink">Membership, classes &amp; receipts <span aria-hidden>→</span></Link>
        </div>
        <Section title="Your details"><Card className="px-5 py-5"><ProfileForm name={p.full_name ?? ""} phone={p.phone ?? ""} email={viewer.email} me={p.marketing_email} ms={p.marketing_sms} /></Card></Section>
        <Section title="Health"><Card className="px-5 py-5"><HealthForm note={health?.note ?? ""} /></Card></Section>
        <Section title="Consents">
          <Card className="px-5 py-4">
            <ul className="divide-y divide-line text-sm">
              {[...latest.entries()].map(([type, c]) => (
                <li key={type} className="flex justify-between gap-3 py-2.5">
                  <span className="text-ink">{CONSENT_LABEL[type] ?? type}</span>
                  <span className="text-right text-ink-soft">{c.granted ? "Given" : "Withdrawn"} · {longDate(c.created_at)}</span>
                </li>
              ))}
              {latest.size === 0 && <li className="py-2 text-ink-soft">No consents recorded yet.</li>}
            </ul>
          </Card>
        </Section>
        <Section title="Your data">
          <Card className="space-y-4 px-5 py-5">
            <p className="text-sm leading-relaxed text-ink-soft">Download everything we hold about you, or delete your account. Read the <Link href="/legal/privacy" className="underline underline-offset-4">Privacy Policy</Link>.</p>
            <a href="/api/account/export" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 bg-white/60 px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-ink hover:bg-white">
              <Download aria-hidden size={17} /> Download my data
            </a>
            <details className="rounded-2xl border border-burgundy/20 bg-burgundy-soft/40 px-4 py-3" open={del === "confirm"}>
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-burgundy">Delete my account</summary>
              <form action={deleteAccount} className="mt-2 space-y-3">
                <p className="text-xs leading-relaxed text-ink">This removes your name, contact details and health note, cancels your upcoming classes and signs you out. Unused credits are lost. We keep minimal anonymised booking and payment records where tax law requires it.</p>
                {del === "confirm" && <Notice tone="error">Type DELETE to confirm.</Notice>}
                <label htmlFor="confirm" className="block text-sm font-medium text-ink">Type DELETE to confirm</label>
                <input id="confirm" name="confirm" autoComplete="off" className={inputClass} />
                <Button type="submit" variant="danger" className="w-full">Delete my account</Button>
              </form>
            </details>
          </Card>
        </Section>
        <div className="px-5">
          <form action={signOutAction}><Button type="submit" variant="ghost" className="w-full"><LogOut aria-hidden size={17} /> Sign out</Button></form>
        </div>
      </div>
    </div>
  );
}
