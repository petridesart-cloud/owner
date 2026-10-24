import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, LogOut } from "lucide-react";
import { Button, ButtonLink, Notice, PageTitle, inputClass } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { dotDate, longDate } from "@/lib/time";
import { eur } from "@/lib/money";
import { receiptLabel } from "@/lib/receipts";
import { deleteAccount, signOutAction } from "./actions";
import { ProfileForm } from "./Forms";
import { Accordion } from "@/components/Accordion";
import { POSTPARTUM, conditionLabel } from "@/lib/health";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const CONSENT_LABEL: Record<string, string> = {
  policy: "Studio Rules", terms: "Terms & Conditions", fitness_declaration: "Health declaration",
  health_data: "Health data", marketing_email: "News by email", marketing_sms: "News by SMS", photos: "Photos for social media",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ delete?: string; dob?: string; health?: string }> }) {
  const { delete: del, dob, health } = await searchParams;
  const viewer = await requireViewer("/account");
  const p = viewer.profile;
  const [{ data: h }, { data: consents }, { data: receipts }] = await Promise.all([
    db().from("health_notes").select("conditions, pregnancy, pregnancy_weeks, postpartum_months, clearance_needed, clearance_received_at").eq("profile_id", p.id).maybeSingle(),
    db().from("consents").select("type, granted, version, created_at").eq("profile_id", p.id).order("created_at", { ascending: false }).limit(30),
    db().from("payments").select("id, description, amount_cents, paid_at, products(tag, credit_kind)").eq("profile_id", p.id).eq("status", "paid").order("paid_at", { ascending: false }).limit(24),
  ]);
  const latest = new Map<string, { granted: boolean; created_at: string }>();
  for (const c of consents ?? []) if (!latest.has(c.type)) latest.set(c.type, c);

  return (
    <div>
      <PageTitle eyebrow={viewer.email} title="Account" />
      <div className="space-y-3 px-5">
        {health === "saved" && <Notice tone="success">Thank you, your health answers are saved.</Notice>}
        <Accordion title="Your details" sub="Name, contact, emergency contact, photos, notifications" open={!p.date_of_birth || !!dob} id="details">
          {!p.date_of_birth && <div className="mb-3"><Notice>Please add your date of birth to keep booking classes.</Notice></div>}
          <ProfileForm p={{
            first: p.first_name ?? p.full_name?.split(" ")[0] ?? "", last: p.last_name ?? "", phone: p.phone ?? "", email: viewer.email,
            dob: p.date_of_birth ?? "", goal: p.goal ?? "", ecName: p.emergency_contact_name ?? "", ecPhone: p.emergency_contact_phone ?? "", ecRelation: p.emergency_contact_relation ?? "",
            photos: p.photo_consent, me: p.marketing_email, reminders: p.reminder_emails,
          }} />
        </Accordion>

        <Accordion title="Health" sub={p.parq_completed_at ? `Answered ${dotDate(p.parq_completed_at)}` : "Please answer before your next booking"} open={!p.parq_completed_at} id="health">
          {p.parq_completed_at ? (
            <div className="space-y-3 text-sm">
              {h?.conditions?.length ? (
                <ul className="flex flex-wrap gap-1.5">{h.conditions.map((k) => <li key={k} className="rounded-full bg-lilac-100 px-2.5 py-1 text-xs text-ink">{conditionLabel(k)}</li>)}</ul>
              ) : <p className="text-ink-soft">{h ? "Saved." : "No injuries or medical conditions."}</p>}
              {h?.pregnancy && <p className="text-ink">Pregnancy: {h.pregnancy === "current" ? `${h.pregnancy_weeks} weeks` : POSTPARTUM.find((o) => o.months === h.postpartum_months)?.label.toLowerCase()}</p>}
              {h?.clearance_needed && !h.clearance_received_at && <Notice>Please bring a written note from your doctor confirming you&apos;re cleared for Pilates, before your next class.</Notice>}
            </div>
          ) : <p className="text-sm text-ink-soft">A quick check so your instructor can keep you safe. It takes about a minute.</p>}
          <ButtonLink href="/health" variant={p.parq_completed_at ? "soft" : "primary"} className="mt-4 w-full">{p.parq_completed_at ? "Update my answers" : "Answer the health questions"}</ButtonLink>
        </Accordion>

        <Accordion title="Receipts" sub={(receipts ?? []).length ? `${receipts!.length} payment${receipts!.length === 1 ? "" : "s"}` : "None yet"}>
          {(receipts ?? []).length ? (
            <ul className="-my-2 divide-y divide-line">
              {receipts!.map((r) => (
                <li key={r.id}>
                  <Link href={`/receipts/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm">
                    <span><span className="block font-medium text-ink">{receiptLabel(r)} · {eur(r.amount_cents)}</span><span className="text-xs text-ink-soft">{r.paid_at ? dotDate(r.paid_at) : ""}</span></span>
                    <ChevronRight aria-hidden size={16} className="text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">Your payment receipts will appear here.</p>}
        </Accordion>

        <Accordion title="Privacy & data" sub="Consents, download or delete my data" open={del === "confirm"}>
            <div className="space-y-4">
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
        </Accordion>
        <div className="pt-5">
          <form action={signOutAction}><Button type="submit" variant="ghost" className="w-full"><LogOut aria-hidden size={17} /> Sign out</Button></form>
        </div>
      </div>
    </div>
  );
}
