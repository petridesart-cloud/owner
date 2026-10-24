import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, LogOut } from "lucide-react";
import { Button, Card, Notice, PageTitle, Section, inputClass } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { dotDate, longDate } from "@/lib/time";
import { eur } from "@/lib/money";
import { receiptLabel } from "@/lib/receipts";
import { deleteAccount, signOutAction } from "./actions";
import { HealthForm, ParqForm, ProfileForm } from "./Forms";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const CONSENT_LABEL: Record<string, string> = {
  policy: "Studio Rules", terms: "Terms & Conditions", fitness_declaration: "Health declaration",
  health_data: "Health data", marketing_email: "News by email", marketing_sms: "News by SMS", photos: "Photos for social media",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ delete?: string; dob?: string }> }) {
  const { delete: del } = await searchParams;
  const viewer = await requireViewer("/account");
  const p = viewer.profile;
  const [{ data: health }, { data: consents }, { data: receipts }] = await Promise.all([
    db().from("health_notes").select("note, injuries, medication, parq_yes").eq("profile_id", p.id).maybeSingle(),
    db().from("consents").select("type, granted, version, created_at").eq("profile_id", p.id).order("created_at", { ascending: false }).limit(30),
    db().from("payments").select("id, description, amount_cents, paid_at, products(tag, credit_kind)").eq("profile_id", p.id).eq("status", "paid").order("paid_at", { ascending: false }).limit(24),
  ]);
  const latest = new Map<string, { granted: boolean; created_at: string }>();
  for (const c of consents ?? []) if (!latest.has(c.type)) latest.set(c.type, c);

  return (
    <div>
      <PageTitle eyebrow={viewer.email} title="Account" />
      <div className="space-y-8">
        <Section title="Your details">
          {!p.date_of_birth && <div className="mb-3"><Notice>Please add your date of birth to keep booking classes.</Notice></div>}
          <Card className="px-5 py-5">
            <ProfileForm p={{
              first: p.first_name ?? p.full_name?.split(" ")[0] ?? "", last: p.last_name ?? "", phone: p.phone ?? "", email: viewer.email,
              dob: p.date_of_birth ?? "", goal: p.goal ?? "", ecName: p.emergency_contact_name ?? "", ecPhone: p.emergency_contact_phone ?? "",
              photos: p.photo_consent, me: p.marketing_email, reminders: p.reminder_emails,
            }} />
          </Card>
        </Section>
        <Section title="Health questions">
          {!p.parq_completed_at && <div className="mb-3 scroll-mt-20" id="parq"><Notice>Please answer these before your next booking.</Notice></div>}
          <Card className="px-5 py-5">
            {p.parq_completed_at && <p className="mb-3 text-sm text-ink-soft">Answered on {dotDate(p.parq_completed_at)}. Update them if anything changes.</p>}
            <ParqForm yes={health?.parq_yes ?? []} answered={!!p.parq_completed_at} shared={!!health?.parq_yes?.length} />
          </Card>
        </Section>
        <Section title="Health">
          <Card className="px-5 py-5">
            <HealthForm injuries={health?.injuries ?? health?.note ?? ""} medication={health?.medication ?? ""} />
          </Card>
        </Section>
        <Section title="Receipts">
          {(receipts ?? []).length ? (
            <ul className="card divide-y divide-line overflow-hidden">
              {receipts!.map((r) => (
                <li key={r.id}>
                  <Link href={`/receipts/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-lilac-50">
                    <span><span className="block font-medium text-ink">{receiptLabel(r)} · {eur(r.amount_cents)}</span><span className="text-xs text-ink-soft">{r.paid_at ? dotDate(r.paid_at) : ""}</span></span>
                    <ChevronRight aria-hidden size={16} className="text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Card className="px-5 py-5 text-sm text-ink-soft">Your payment receipts will appear here.</Card>}
        </Section>
        <Section title="Privacy & data">
          <details className="card px-5 py-1">
            <summary className="min-h-12 cursor-pointer content-center text-sm font-medium text-ink">Consents, download or delete my data</summary>
            <div className="space-y-4 pb-4">
              <div>
            <ul className="divide-y divide-line text-sm">
              {[...latest.entries()].map(([type, c]) => (
                <li key={type} className="flex justify-between gap-3 py-2.5">
                  <span className="text-ink">{CONSENT_LABEL[type] ?? type}</span>
                  <span className="text-right text-ink-soft">{c.granted ? "Given" : "Withdrawn"} · {longDate(c.created_at)}</span>
                </li>
              ))}
              {latest.size === 0 && <li className="py-2 text-ink-soft">No consents recorded yet.</li>}
            </ul>
          </div>
              <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">Download everything we hold about you, or delete your account. Read the <Link href="/legal/privacy" className="underline underline-offset-4">Privacy Policy</Link>.</p>
            <a href="/api/account/export" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 bg-white/60 px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-ink hover:bg-white">
              <Download aria-hidden size={17} /> Download my data
            </a>
            <details className="rounded-2xl border border-burgundy/20 bg-burgundy-soft/40 px-4 py-3" open={del === "confirm"}>
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-burgundy">Delete my account</summary>
              <form action={deleteAccount} className="mt-2 space-y-3">
                <p className="text-xs leading-relaxed text-ink">This removes your name, contact details and health information, cancels your upcoming classes and signs you out. Unused credits are lost. We keep minimal anonymised booking and payment records where tax law requires it.</p>
                {del === "confirm" && <Notice tone="error">Type DELETE to confirm.</Notice>}
                <label htmlFor="confirm" className="block text-sm font-medium text-ink">Type DELETE to confirm</label>
                <input id="confirm" name="confirm" autoComplete="off" className={inputClass} />
                <Button type="submit" variant="danger" className="w-full">Delete my account</Button>
              </form>
            </details>
          </div>
            </div>
          </details>
        </Section>
        <div className="px-5">
          <form action={signOutAction}><Button type="submit" variant="ghost" className="w-full"><LogOut aria-hidden size={17} /> Sign out</Button></form>
        </div>
      </div>
    </div>
  );
}
