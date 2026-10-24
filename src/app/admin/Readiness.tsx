import Link from "next/link";
import { Check, Circle } from "lucide-react";
import type { ReadinessItem } from "@/lib/business";

/** "Before your first client": a short list she can tick off herself. */
export function Readiness({ items, compact = false }: { items: ReadinessItem[]; compact?: boolean }) {
  const left = items.filter((i) => !i.ok).length;
  if (compact && !left) return null;
  return (
    <section className="card mb-5 px-4 py-4" aria-labelledby="ready">
      <h2 id="ready" className="display text-[0.95rem]">{left ? "Before your first client" : "Ready for clients"}</h2>
      <p className="mb-2 text-sm text-ink-soft">{left ? `${left} thing${left === 1 ? "" : "s"} left.` : "Everything is set up."}</p>
      <ul className="divide-y divide-line">
        {items.filter((i) => !compact || !i.ok).map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex min-h-12 items-start gap-3 py-2.5">
              {i.ok ? <Check aria-label="Done" size={18} className="mt-0.5 shrink-0 text-plum-700" /> : <Circle aria-label="To do" size={18} className="mt-0.5 shrink-0 text-burgundy" />}
              <span><span className="block text-sm font-medium text-ink">{i.label}</span>{!i.ok && <span className="block text-xs text-ink-soft">{i.hint}</span>}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
