import { db } from "@/lib/supabase/admin";
import { AdminTitle } from "../ui";
import { ComplianceToggle } from "./Toggle";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Before online payments (unlocks the switch in Settings)", items: [
    ["pay_registered_self_employed", "Registered as self-employed / with the Tax Department"],
    ["pay_vat_position_confirmed", "Accountant confirmed the VAT position"],
    ["pay_bank_stripe_verified", "Bank account and Stripe account verified in her name"],
    ["pay_legal_texts_reviewed", "Terms, refund policy and privacy policy reviewed"],
    ["pay_liability_insurance", "Liability insurance confirmed"],
  ]},
  { title: "Legal pages", items: [
    ["privacy_policy_reviewed", "Privacy Policy reviewed by a lawyer (processors, retention, rights, contact)"],
    ["terms_reviewed", "Terms & Conditions reviewed (booking, payment, packs & expiry, late/no-show, cancellations, liability)"],
    ["cancellation_policy_reviewed", "Cancellation & Refund Policy reviewed"],
    ["withdrawal_right_confirmed", "Lawyer confirmed the 14-day withdrawal exemption for dated leisure services"],
    ["health_disclaimer_reviewed", "Health & Safety disclaimer reviewed"],
    ["business_details_filled", "Trading name, her full name, studio address, email and phone entered in Settings"],
    ["cookie_policy_reviewed", "Cookies policy lists every cookie"],
  ]},
  { title: "Privacy & GDPR", items: [
    ["health_consent_flow_tested", "Health note requires separate, unticked explicit consent; visible only to the instructor"],
    ["data_export_tested", "“Download my data” tested"],
    ["account_deletion_tested", "“Delete my account” tested (keeps only minimal accounting records)"],
    ["consent_log_verified", "Consents logged with timestamps (policy, health data, marketing)"],
    ["marketing_opt_in_only", "Marketing is opt-in only, separate from transactional messages, with unsubscribe"],
    ["retention_job_scheduled", "Retention: inactive accounts reviewed/anonymised after 24 months"],
    ["no_nonessential_cookies", "No non-essential cookies or trackers load before consent; no personal data in URLs/analytics"],
  ]},
  { title: "Processors (sign DPAs, EU region)", items: [
    ["dpa_supabase", "Supabase DPA signed"], ["supabase_eu_region", "Supabase project in an EU region (Frankfurt)"],
    ["dpa_stripe", "Stripe DPA accepted"], ["dpa_resend", "Resend DPA accepted"], ["dpa_twilio", "Twilio DPA accepted (if SMS used)"], ["dpa_vercel", "Vercel DPA accepted"],
  ]},
  { title: "Security", items: [
    ["supabase_backups_enabled", "Supabase backups enabled (Pro plan for daily backups / PITR)"],
    ["rls_verified", "Row-level security verified on every table"],
    ["admin_roles_verified", "Only the instructor's email is in ADMIN_EMAILS"],
    ["otp_rate_limit_verified", "Sign-in code rate limit verified"],
    ["https_only", "Custom domain on HTTPS"],
    ["demo_mode_off", "DEMO_MODE=false in production"],
    ["stripe_live_keys", "Stripe live keys + webhook configured"],
    ["apple_pay_domain_verified", "Apple Pay domain verified in Stripe"],
  ]},
  { title: "Accessibility (WCAG 2.2 AA)", items: [
    ["contrast_checked", "Colour contrast ≥ 4.5:1 checked for all text tokens"],
    ["keyboard_screenreader_tested", "Full booking flow tested with keyboard and VoiceOver"],
    ["reduced_motion_tested", "Reduced-motion setting respected"],
    ["alt_text_reviewed", "Alt text on all real photos"],
  ]},
  { title: "Honest content", items: [
    ["photos_permission", "Only own photos, with permission from anyone pictured"],
    ["no_unsupported_claims", "No medical claims, “best in Limassol”, fake reviews, or unverified certifications"],
    ["fonts_licensed", "Fonts are Google Fonts / licensed"],
  ]},
];

export default async function CompliancePage() {
  const { data } = await db().from("compliance_items").select("key, done");
  const done = new Map((data ?? []).map((r) => [r.key, r.done]));
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);
  const complete = GROUPS.reduce((n, g) => n + g.items.filter(([k]) => done.get(k)).length, 0);
  return (
    <div>
      <AdminTitle back="/admin/settings" title="Launch checklist" sub={`${complete} of ${total} done. Tick items off before taking real bookings.`} />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-lilac-50" role="progressbar" aria-valuenow={complete} aria-valuemin={0} aria-valuemax={total} aria-label="Checklist progress">
        <div className="h-full rounded-full bg-lilac-300" style={{ width: `${(complete / total) * 100}%` }} />
      </div>
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <section key={g.title} className="card px-5 py-4">
            <h2 className="display mb-1 text-[0.9rem]">{g.title}</h2>
            {g.items.map(([k, label]) => <ComplianceToggle key={k} k={k} label={label} done={!!done.get(k)} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
