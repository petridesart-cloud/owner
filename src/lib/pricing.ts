import { eur } from "@/lib/money";

/** Booking code clients use as the bank-transfer / Revolut reference. */
export const paymentReference = (paymentId: string) => `RF-${paymentId.slice(0, 6).toUpperCase()}`;

/** Student discount: group packages only, while the student status is verified. */
export function productPrice(
  product: { price_cents: number; is_group: boolean; kind: string },
  profile: { student_verified_until: string | null } | null,
  cfg: { student_discount_pct: number },
) {
  const today = new Date().toISOString().slice(0, 10);
  const student = !!profile?.student_verified_until && profile.student_verified_until >= today && product.is_group && product.kind !== "single" && cfg.student_discount_pct > 0;
  return { cents: student ? Math.round(product.price_cents * (1 - cfg.student_discount_pct / 100)) : product.price_cents, student };
}

export function paymentInstructions(cfg: { revolut_link: string; bank_iban: string; bank_account_name: string; unpaid_request_expiry_hours: number }, cents: number, ref: string) {
  const ways = ["cash at the studio"];
  if (cfg.revolut_link) ways.push(`Revolut (${cfg.revolut_link})`);
  if (cfg.bank_iban) ways.push(`bank transfer to ${cfg.bank_account_name || "Re·Form"}, IBAN ${cfg.bank_iban}, reference ${ref}`);
  return `${eur(cents)}, paid in advance by ${ways.join(", or ")}. Your classes are added as soon as it's received. Requests are held for ${cfg.unpaid_request_expiry_hours} hours.`;
}

