import type { ReactNode } from "react";
import { Flower } from "./Flower";

/** Policy page in the style of her Instagram story: big serif title, lilac grain, flower bullets. */
export function PolicyCard({ title, items, footnote }: { title: string; items: ReactNode[]; footnote?: ReactNode }) {
  return (
    <article className="policy-grain mx-3 mt-3 overflow-hidden rounded-[var(--radius-sheet)] px-6 pb-10 pt-9 shadow-[var(--shadow-soft)]">
      <p className="text-center font-serif text-lg font-light text-plum-700" aria-hidden>Re·Form</p>
      <h1 className="mt-6 font-serif text-[2.6rem] font-normal leading-[1.02] tracking-[-0.01em] text-ink">{title}</h1>
      <ul className="mt-7 space-y-4">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-[1.05rem] leading-[1.65] text-ink">
            <Flower className="mt-[0.3em] size-[1.15rem] shrink-0 text-plum-700/80" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      {footnote && <div className="mt-8 border-t border-ink/10 pt-4 text-sm leading-relaxed text-ink-soft">{footnote}</div>}
    </article>
  );
}
