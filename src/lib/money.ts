export function eur(cents: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/** Prices are entered VAT-inclusive. Returns the VAT portion contained in a gross amount. */
export function vatPortion(grossCents: number, ratePct: number, registered: boolean) {
  if (!registered || ratePct <= 0) return 0;
  return Math.round(grossCents - grossCents / (1 + ratePct / 100));
}

export function vatLine(grossCents: number, ratePct: number, registered: boolean) {
  if (!registered) return "VAT not applicable";
  return `incl. ${Number(ratePct)}% VAT (${eur(vatPortion(grossCents, ratePct, registered))})`;
}
