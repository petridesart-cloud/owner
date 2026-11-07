// The legal documents, in the same plain format as her Terms ("## " headings, "- " bullets, "| " table rows,
// [label](/path) links), rendered by MarkedText in the app and written to docs/*.md by `npm run legal:docs`.
// They follow the settings, so the 6-hour rule, the booking window and the retention periods are always the
// ones the app applies. Identity details she hasn't filled in yet stay visible [placeholders] (A-012, A-013).
import { identity, type IdentitySettings } from "@/lib/identity";

export type LegalSettings = IdentitySettings & {
  cancellation_cutoff_hours: number;
  booking_window_days: number;
  unpaid_request_expiry_hours: number;
  student_discount_pct: number;
  waitlist_close_minutes: number;
  online_payments_enabled: boolean;
  vat_registered: boolean;
  vat_rate: number | string;
  refund_late_cancel_if_filled: boolean;
  retention_health_months: number | null;
  retention_inactive_months: number | null;
  retention_payments_years: number | null;
  retention_messages_months: number | null;
  retention_audit_months: number | null;
  retention_auth_log_days: number | null;
  retention_event_extras_months: number | null;
  retention_codes_months: number | null;
  retention_consents_years: number | null;
  retention_notice_days: number;
};

/** The documents clients accept or read, as stored in policy_versions.doc. */
export const LEGAL_DOCS = ["terms", "studio_rules", "payments_policy", "waiver", "privacy", "cookies"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];
/** Accepted at sign-up and welcome (one consents row each); Privacy and Cookies are information, not accepted. */
export const ACCEPTED_DOCS = ["terms", "studio_rules", "payments_policy", "waiver"] as const satisfies readonly LegalDoc[];

export const DOC_TITLE: Record<LegalDoc | "accessibility", string> = {
  terms: "Terms & Conditions",
  studio_rules: "Studio Rules",
  payments_policy: "Payments & Cancellation Policy",
  waiver: "Health & Safety acknowledgement",
  privacy: "Privacy Policy",
  cookies: "Cookies Policy",
  accessibility: "Accessibility statement",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const months = (n: number | null, then: string) => `${n == null ? "As long as needed" : plural(n, "month")} ${then}`.trim();
const years = (n: number | null, then: string) => `${n == null ? "As long as needed" : plural(n, "year")} ${then}`.trim();

export function privacyText(s: LegalSettings) {
  const id = identity(s);
  const notice = plural(s.retention_notice_days, "day");
  return [
    "## Who we are",
    `${id.owner}, an individual trader (not a company), trading as ${id.name}, ${id.address}, is the controller of your personal data. For anything about your data, contact ${id.email} or ${id.phone}. We haven't appointed a data protection officer because the law doesn't require one for a studio of our size.`,
    "## What we collect, why, and on what legal basis",
    "| Data | Why | Legal basis |",
    "| --- | --- | --- |",
    "| Name, email, mobile number, password (stored only as a secure hash) | Your account, bookings, reminders and contacting you about a class | Contract |",
    "| Date of birth | Checking you're 18 or over; a birthday message once a year | Contract (age); legitimate interest (birthday message) |",
    "| Emergency contact (name, phone, relation) | Calling someone if you're unwell in class. Please tell them you've given us their details | Vital and legitimate interests |",
    "| Your goal (optional) | Tailoring your classes | Contract |",
    "| Photo choice (with face, without face, none) | Posting class photos on Instagram only as you chose | Consent |",
    "| Student verification date | The student discount; we check your card in person and never keep a copy | Contract |",
    "| Bookings, attendance, no-shows, waitlist and weekly bookings | Providing your classes | Contract |",
    "| Packages, class history and freezes | Keeping track of your classes and their validity | Contract; legal obligation (bookkeeping) |",
    "| Payments (amount, method, date, reference; no card details) | Payment records and receipts | Legal obligation (bookkeeping) |",
    "| Rewards and discount codes | Applying them to your requests | Contract |",
    "| Event answers and notes | Organising events | Contract |",
    "| The instructor's notes about you (never health details) | Running your classes | Legitimate interest |",
    "| Health answers and their history | Adapting exercises so you stay safe | Your explicit consent (GDPR art. 9(2)(a)) |",
    "| Consent and acceptance records (what you accepted, which version, when) | Proving what you agreed to | Legal obligation; legitimate interest |",
    "| Message log (the emails we sent you) | Proof of delivery and fixing problems | Legitimate interest |",
    "| Security records (keyed hashes of your email and network address, never in clear text) | Stopping password and code guessing | Legitimate interest |",
    "| Log of studio actions (who changed what) | Accountability and security | Legitimate interest |",
    "## Your health answers",
    `Health answers are optional to store. They are kept only with your separate, explicit consent, and only the instructor (${id.owner}) can read them; other studio team members see only "Doctor's note needed" or "tell in person". You can choose "I'd rather tell my instructor in person" instead: we then store nothing and you can still book. You can delete your health answers and their history at any time in Account → Health → Delete my health information, which also withdraws your consent. Health answers are never sent by email.`,
    "## Where the data comes from",
    `Mostly from you. The studio also adds details when it books you after a message, a call or an Instagram DM (your name, contact details and notes)${s.online_payments_enabled ? ", and Stripe tells us when an online payment is completed" : ""}.`,
    "## What you must give us",
    "Your name, email, mobile number and date of birth are needed to book (without them we can't provide the classes). Health answers, your goal, photos and news are optional.",
    "## Trials and your phone number",
    "To keep trial prices for first-timers, we compare the last 8 digits of your mobile number with earlier bookings (legitimate interest). You can object to this. We make no other automated decisions about you and don't profile you.",
    "## Who receives your data",
    "We use these service providers, each under a data processing agreement:",
    "- Supabase: database, sign-in and photo storage, in Frankfurt (EU). Support staff in the US work under Standard Contractual Clauses.",
    "- Vercel: hosting, running in Frankfurt (EU) with a global network that delivers the pages. EU-US Data Privacy Framework and Standard Contractual Clauses.",
    "- Resend: sending our emails, from its EU region. Resend is a US company: EU-US Data Privacy Framework and Standard Contractual Clauses. It keeps delivery logs for [Resend log retention] days.",
    "- [Studio mailbox provider]: the studio's mailbox, which receives your replies and studio notices about bookings.",
    "- Twilio (text messages) only if we turn texts on; it's a US company working under the EU-US Data Privacy Framework and Standard Contractual Clauses. Texts are off today.",
    s.online_payments_enabled
      ? "- Stripe: card payments. Stripe handles your card details; we never see or store them."
      : "- Stripe: card payments, only if we turn online payments on (they're off today). Stripe would handle your card details; we never see or store them.",
    "We post photos on Instagram only according to your photo choice. Instagram (Meta) is a separate controller for its own platform. We never sell your data, and we use no advertising or analytics trackers.",
    "## How long we keep it",
    "| Data | Kept for |",
    "| --- | --- |",
    `| Health answers and their history | Until you delete them or withdraw consent, and at most ${months(s.retention_health_months, "after your last class (or the last time you answered)")}. We email you ${notice} before. |`,
    `| Your account | ${months(s.retention_inactive_months, "after your last booking, sign-in, payment or live package")}, then it's deleted. We email you ${notice} before. |`,
    `| Payments, packages and the bookings and class history linked to them | ${years(s.retention_payments_years, "from the end of the year they belong to (Cyprus tax law)")} |`,
    `| Emails we sent you (message log) | ${months(s.retention_messages_months, "")} |`,
    `| Event answers, booking notes, waitlist places and event invitations | ${months(s.retention_event_extras_months, "after the class or event")} |`,
    `| Personal rewards | ${months(s.retention_codes_months, "after they're used or end")} |`,
    `| Log of studio actions | ${months(s.retention_audit_months, "")} |`,
    `| Sign-in records | ${s.retention_auth_log_days == null ? "As long as needed" : plural(s.retention_auth_log_days, "day")} |`,
    "| Security records | 24 hours |",
    `| Consent and acceptance records | ${years(s.retention_consents_years, "after your account is deleted (to prove consent)")} |`,
    "## When you delete your account",
    "It happens straight away: your name, contact details, date of birth, emergency contact, goal, notes and health answers are erased, your upcoming classes are cancelled and the emails we sent you are erased. Unused classes are lost, so if you're within the 14-day withdrawal period, tell the studio first (see the [Terms](/legal/terms)). We keep anonymised booking and payment records that tax law requires.",
    "## Your rights",
    "- Access and a copy of your data: Account → Privacy & data → Download my data.",
    "- Correcting it: Account → Your details.",
    "- Erasure: Account → Privacy & data → Delete my account, or ask the studio.",
    "- Restricting or objecting to processing, including the trial phone check.",
    "- Withdrawing consent at any time: health in Account → Health; news and photos in Account → Your details.",
    `We reply within one month. To ask, contact ${id.email}. You can also complain to the Commissioner for Personal Data Protection, Iasonos 1, 1082 Nicosia, Cyprus (commissioner@dataprotection.gov.cy, www.dataprotection.gov.cy).`,
    "## Age",
    "Our classes and this app are for adults aged 18 or over. We don't knowingly collect data about children.",
    "## Security",
    "Your data is encrypted in transit (HTTPS) and at rest. Only the instructor can read health answers. Sign-in cookies can't be read by scripts, sign-in attempts are rate-limited, and studio actions are logged.",
    "## Cookies",
    "We use essential cookies only. See the [Cookies Policy](/legal/cookies).",
    "## Changes",
    "If we change this policy in a way that matters, we'll tell you in the app or by email. The version and date are shown on this page.",
  ].join("\n");
}

export function cookiesText() {
  return [
    "## Essential cookies only",
    "We only use cookies that are strictly necessary to sign you in and keep your account secure. We don't use analytics, advertising or tracking cookies, or any similar technology (nothing is kept in your browser's local storage), so we don't ask for cookie consent (Cyprus Law 112(I)/2004, art. 99(5)).",
    "| Cookie | Set by | Purpose | Duration | Type |",
    "| --- | --- | --- | --- | --- |",
    "| sb-…-auth-token (sometimes split into .0, .1) | Re·Form (Supabase sign-in) | Keeps you signed in securely. Scripts can't read it, and it's only sent over HTTPS to this site | Up to 400 days, or until you sign out | Essential |",
    "| sb-…-auth-token-code-verifier | Re·Form (Supabase sign-in) | Completes a sign-in step, if one is used | A few minutes | Essential |",
    "## Fonts and images",
    "Fonts come from our own site and images from our database provider in the EU. No requests go to Google or to trackers.",
    "## Other sites",
    "Links to Instagram open Instagram's site under its own policy. If we turn card payments on, they happen on Stripe's checkout page, which sets its own fraud-prevention cookies under Stripe's cookie policy.",
    "## Controlling cookies",
    "Sign out, or clear this site's cookies in your browser (you'll be signed out).",
    "## More",
    "See the [Privacy Policy](/legal/privacy).",
  ].join("\n");
}

export function waiverText(s: LegalSettings) {
  const id = identity(s);
  return [
    "## The activity",
    "Reformer and mat Pilates are physical exercise with moving equipment (springs, a sliding carriage and straps). As with any exercise, there is a risk of strain or injury.",
    "## You confirm that",
    "- to your knowledge, you're fit to take part in exercise;",
    "- you've answered the health questions truthfully, or you'll tell the instructor in person before your first class;",
    "- you'll tell the instructor before each class about any new injury, condition, surgery, pregnancy or medication;",
    "- you'll follow the instructor's guidance, use the equipment only as shown, and stop and tell the instructor if you feel pain, dizziness, shortness of breath or discomfort;",
    "- you'll check with your doctor or physiotherapist if you're in any doubt.",
    "## When a doctor's note is needed",
    "Please bring a written note from your doctor confirming you're cleared for Pilates before your next class if you're currently pregnant, gave birth within the last 3 months, or had surgery in the last 12 months. The instructor may not let you take part without it.",
    "## Not medical treatment",
    "Our classes don't diagnose or treat any condition and don't replace advice from a healthcare professional.",
    "## Your part and ours",
    `You take part voluntarily and accept the ordinary risks of exercise. Nothing here limits ${id.owner}'s liability for death or personal injury caused by negligence, or any other liability that can't be limited by law.`,
    "## In an emergency",
    "Add an emergency contact in Account → Your details. The studio may call them, and the emergency services, if needed.",
    "## How your acceptance is recorded",
    "The app records the date, time and version of this acknowledgement when you accept it. If we change it, you'll be asked to accept the new version.",
  ].join("\n");
}

export function accessibilityText(s: LegalSettings) {
  const id = identity(s);
  return [
    "## Our aim",
    "We want everyone to be able to book a class. This app aims to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA: it works with screen readers and keyboards, text keeps a strong contrast, it respects reduced-motion settings and it works at large text sizes.",
    "## If something doesn't work for you",
    `Tell us at ${id.email} or ${id.phone}, or on Instagram ${id.instagram}, and we'll book you by phone or message instead and fix what we can.`,
    "## About this statement",
    "Re·Form is a micro-enterprise, so the European Accessibility Act's requirements don't apply to it; we follow them anyway as good practice. We checked the app ourselves (automated checks and testing with a screen reader) in November 2026 and will review this statement every year.",
  ].join("\n");
}
