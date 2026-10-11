"use client";
import { useState, useTransition } from "react";
import { confirmClosure, dismissClosure } from "../actions";

export function ClosureActions({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span role="status" className="max-w-[12rem] text-right text-xs text-plum-700">{msg}</span>;
  return (
    <span className="flex shrink-0 gap-1.5">
      <button disabled={pending} aria-label={`Close the studio for ${name}`} className="min-h-10 rounded-full bg-ink px-3 text-xs font-medium text-paper"
        onClick={() => { if (confirm(`Close the studio for ${name}? Classes that day are cancelled and clients credited.`)) start(async () => { const r = await confirmClosure(id); setMsg(r.ok ? r.message ?? "Confirmed" : r.error); }); }}>
        Closed
      </button>
      <button disabled={pending} aria-label={`Dismiss ${name}`} className="min-h-10 rounded-full border border-line bg-white px-3 text-xs text-ink"
        onClick={() => start(() => dismissClosure(id))}>Open</button>
    </span>
  );
}
