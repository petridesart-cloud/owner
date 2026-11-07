// docs/PRIVACY.md, TERMS.md, WAIVER.md and COOKIES.md are generated from the same texts the app shows
// (src/lib/legal.ts, src/lib/terms.tsx) with the studio's default settings and the identity left as
// [placeholders]. Regenerate with `npm run legal:docs`; tests/unit.test.ts fails if they drift.
import { DOC_TITLE, cookiesText, privacyText, waiverText, type LegalSettings } from "@/lib/legal";
import { defaultTerms } from "@/lib/terms";

/** The defaults of studio_settings (schema and the WP7 retention columns), with no identity filled in. */
export const DOC_SETTINGS: LegalSettings = {
  legal_name: "Re·Form Pilates Studio", trader_name: "[Owner full name]", address: "[Street, Limassol, Cyprus]",
  contact_email: "hello@example.com", contact_phone: "+357 00 000000", instagram_handle: "re_form_es",
  cancellation_cutoff_hours: 6, booking_window_days: 28, unpaid_request_expiry_hours: 48, student_discount_pct: 10,
  waitlist_close_minutes: 60, online_payments_enabled: false, vat_registered: false, vat_rate: 19, refund_late_cancel_if_filled: false,
  retention_health_months: 12, retention_inactive_months: 24, retention_payments_years: 6, retention_messages_months: 12,
  retention_audit_months: 24, retention_auth_log_days: 90, retention_event_extras_months: 3, retention_codes_months: 12,
  retention_consents_years: 3, retention_notice_days: 30,
};

export const DOCS_UPDATED = "7 November 2026";

/** The app's plain format as Markdown: blank lines between blocks, lists and tables kept together. */
export function toMarkdown(title: string, text: string, where: string, accepted = false) {
  const note = accepted ? "Each version is kept, and the version you accepted at sign-up is recorded." : "Each version is kept.";
  const out: string[] = [`# ${title}`, "", `Last updated ${DOCS_UPDATED}. Shown in the app at ${where}. ${note} Details in [brackets] are filled in from Admin → Settings.`];
  let prev = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const kind = line.startsWith("- ") ? "ul" : line.startsWith("|") ? "table" : "block";
    if (!(kind !== "block" && kind === prev)) out.push("");
    out.push(line.startsWith("## ") ? line : line.replace(/\]\(\//g, "](https://book.reformpilatescy.com/"));
    prev = kind;
  }
  return out.join("\n") + "\n";
}

export function legalMarkdown(s: LegalSettings = DOC_SETTINGS): Record<string, string> {
  return {
    "docs/PRIVACY.md": toMarkdown(DOC_TITLE.privacy, privacyText(s), "/legal/privacy"),
    "docs/TERMS.md": toMarkdown(DOC_TITLE.terms, defaultTerms(s), "/legal/terms (the studio can edit this text in Admin → Settings → Your texts)", true),
    "docs/WAIVER.md": toMarkdown(DOC_TITLE.waiver, waiverText(s), "/legal/health", true),
    "docs/COOKIES.md": toMarkdown(DOC_TITLE.cookies, cookiesText(), "/legal/cookies"),
  };
}
