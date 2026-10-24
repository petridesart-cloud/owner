import type { ReactNode } from "react";
import { BackButton } from "@/components/BackButton";

/** Page title. Every page but Today gets a Back button (one step back; `back` is where it goes when opened directly). */
export function AdminTitle({ title, sub, action, back = "/admin" }: { title: string; sub?: ReactNode; action?: ReactNode; back?: string | false }) {
  return (
    <>
    {back && <div className="-mt-2 mb-1"><BackButton href={back} /></div>}
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="display text-[1.5rem] text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
    </>
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
