"use client";
import { useState, useTransition } from "react";
import { adminCancelBooking, markNoShow } from "../../actions";

const remove = "min-h-10 rounded-full border border-burgundy/30 bg-white px-3 text-xs text-burgundy hover:bg-burgundy-soft";

export function RosterActions({ bookingId, sessionId, name, past, insideCutoff = false, cutoffHours = 6 }: {
  bookingId: string; sessionId: string; name: string; past: boolean; insideCutoff?: boolean; cutoffHours?: number;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const go = (returnClass: boolean, question: string) => {
    if (confirm(question)) start(async () => { const r = await adminCancelBooking(bookingId, sessionId, returnClass); if (!r.ok) setErr(r.error); });
  };
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      {past ? (
        <button disabled={pending} onClick={() => start(async () => { const r = await markNoShow(bookingId); if (!r.ok) setErr(r.error); })} className="min-h-10 rounded-full border border-line bg-white px-3 text-xs text-ink hover:bg-lilac-50" aria-label={`Mark ${name} as no-show`}>No-show</button>
      ) : insideCutoff ? (
        // A-085 (her answer): inside the cutoff the default is a late cancel; returning the class is a separate choice.
        <>
          <button disabled={pending} className={remove} aria-label={`Remove ${name} as a late cancel, no class back`}
            onClick={() => go(false, `Remove ${name}? It's inside the ${cutoffHours}-hour window, so this is a late cancel: the class isn't returned. They're notified.`)}>
            {pending ? "…" : "Remove (late cancel)"}
          </button>
          <button disabled={pending} className={remove} aria-label={`Remove ${name} and return their class`}
            onClick={() => go(true, `Remove ${name} and return their class? They're notified.`)}>
            {pending ? "…" : "Remove + return class"}
          </button>
        </>
      ) : (
        <button disabled={pending} className={remove} aria-label={`Cancel ${name}'s booking and return their credit`}
          onClick={() => go(true, `Cancel ${name}'s booking? Their credit is returned and they're notified.`)}>
          {pending ? "…" : "Remove"}
        </button>
      )}
      {err && <span role="alert" className="text-xs text-burgundy">{err}</span>}
    </div>
  );
}
