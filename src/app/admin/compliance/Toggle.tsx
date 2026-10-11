"use client";
import { useOptimistic, useTransition } from "react";
import { toggleCompliance } from "../actions";

export function ComplianceToggle({ k, done, label }: { k: string; done: boolean; label: string }) {
  const [on, set] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-ink">
      <input type="checkbox" checked={on} onChange={() => start(async () => { set(!on); await toggleCompliance(k, !on); })} className="mt-0.5 size-5 shrink-0 accent-ink" />
      <span className={on ? "text-ink-soft line-through" : ""}>{label}</span>
    </label>
  );
}
