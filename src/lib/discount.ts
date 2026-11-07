import { eur } from "@/lib/money";
/** Rewards and discount codes: the maths shared by the Packages page (display) and the server (the real price). */
export type DiscountKind = "percent" | "amount" | "free_classes";
export type DiscountTarget = "package" | "trial" | "drop_in" | "event";
export const TARGETS: { value: DiscountTarget; label: string }[] = [
  { value: "trial", label: "Trial" }, { value: "drop_in", label: "Drop-in" }, { value: "package", label: "Package" }, { value: "event", label: "Event" },
];
export type Discount = { code: string; kind: DiscountKind; value: number; label: string; personal: boolean; expiresOn: string | null; appliesTo: DiscountTarget[] };

/** "packages", "trials and drop-ins"… for her lists. */
export const targetsLabel = (t: string[]) => {
  const names = TARGETS.filter((x) => t.includes(x.value)).map((x) => `${x.label.toLowerCase()}s`);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "packages";
};


/** "10% off", "€15 off", "1 free class". Amounts are in cents. */
export function discountLabel(kind: DiscountKind, value: number) {
  if (kind === "percent") return `${value}% off`;
  if (kind === "amount") return `${eur(value)} off`;
  return `${value} free class${value === 1 ? "" : "es"}`;
}

/**
 * The price with a code. A % or € code is measured against the full price and replaces the student price
 * when it's lower (they don't stack). Free classes are added on top of whatever price applies.
 */
export function withDiscount(listCents: number, bestCents: number, d: Pick<Discount, "kind" | "value"> | null) {
  if (!d) return { cents: bestCents, applies: false, extraClasses: 0 };
  if (d.kind === "free_classes") return { cents: bestCents, applies: true, extraClasses: d.value };
  const cents = d.kind === "percent" ? Math.round(listCents * (1 - Math.min(d.value, 100) / 100)) : Math.max(0, listCents - d.value);
  return cents < bestCents ? { cents, applies: true, extraClasses: 0 } : { cents: bestCents, applies: false, extraClasses: 0 };
}

/** Codes are typed loosely ("summer 10") and stored as SUMMER10. */
export const normaliseCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]/g, "");
