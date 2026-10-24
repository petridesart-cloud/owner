// "Reformer package", "Mat trial", "Reformer drop-in", or the payment description.
export function receiptLabel(r: { description: string | null; products?: { tag: string; credit_kind: string | null } | null }) {
  const p = r.products;
  if (p?.credit_kind) {
    const kind = p.credit_kind === "reformer" ? "Reformer" : "Mat";
    const what = { package: "package", trial: "trial", drop_in: "drop-in", membership: "monthly package" }[p.tag] ?? "package";
    return `${kind} ${what}`;
  }
  return (r.description ?? "Payment").split(" · ")[0];
}
