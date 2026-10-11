"use client";
import { useState, useTransition } from "react";
import { adminCancelBooking, markNoShow } from "../../actions";

export function RosterActions({ bookingId, sessionId, name, past }: { bookingId: string; sessionId: string; name: string; past: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 gap-1.5">
      {past ? (
        <button disabled={pending} onClick={() => start(() => markNoShow(bookingId))} className="min-h-10 rounded-full border border-line bg-white px-3 text-xs text-ink hover:bg-lilac-50" aria-label={`Mark ${name} as no-show`}>No-show</button>
      ) : (
        <button disabled={pending} className="min-h-10 rounded-full border border-burgundy/30 bg-white px-3 text-xs text-burgundy hover:bg-burgundy-soft" aria-label={`Cancel ${name}'s booking and return their credit`}
          onClick={() => { if (confirm(`Cancel ${name}'s booking? Their credit is returned and they're notified.`)) start(async () => { const r = await adminCancelBooking(bookingId, sessionId); if (!r.ok) setErr(r.error); }); }}>
          {pending ? "…" : "Remove"}
        </button>
      )}
      {err && <span role="alert" className="text-xs text-burgundy">{err}</span>}
    </div>
  );
}
