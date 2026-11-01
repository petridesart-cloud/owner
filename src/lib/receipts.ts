import { labelOf } from "@/lib/kind-label";
// "Reformer package", "Mat trial", "Reformer drop-in", or the payment description.
export function receiptLabel(r: { description: string | null; products?: { tag: string; credit_kind: string | null } | null }, labels?: Record<string, string>) {
  const p = r.products;
  if (p?.credit_kind) {
    const kind = labelOf(labels, p.credit_kind);
    const what = { package: "package", trial: "trial", drop_in: "drop-in", membership: "monthly package" }[p.tag] ?? "package";
    return `${kind} ${what}`;
  }
  return (r.description ?? "Payment").split(" · ")[0];
}
