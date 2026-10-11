import type { ReactNode } from "react";

export function AdminTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="display text-[1.5rem] text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-serif text-3xl leading-none text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export const smallInput = "min-h-11 rounded-xl border border-line bg-white px-3 text-[0.95rem] text-ink focus:border-plum-700 focus:outline-none focus:ring-2 focus:ring-lilac-300";
