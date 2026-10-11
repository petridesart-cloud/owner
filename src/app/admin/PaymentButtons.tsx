"use client";
import { useState, useTransition } from "react";
import { markPaid, renewMembership, setMembershipState } from "./actions";

const btn = "min-h-10 rounded-full border px-3 text-xs font-medium transition active:scale-[0.97] disabled:opacity-50";

/** "Mark as paid": cash or card in person. Credits/booking are settled via the ledger. */
export function MarkPaid({ paymentId, label }: { paymentId: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span role="status" className="text-xs font-medium text-plum-700">{msg}</span>;
  const go = (m: "cash" | "card_in_person" | "revolut" | "bank_transfer") => start(async () => { const r = await markPaid(paymentId, m); setMsg(r.ok ? "Paid ✓" : r.error); });
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1.5" role="group" aria-label={`Mark ${label} as paid`}>
      <button disabled={pending} onClick={() => go("cash")} className={`${btn} border-ink bg-ink text-paper`}>Cash</button>
      <button disabled={pending} onClick={() => go("revolut")} className={`${btn} border-line bg-white text-ink`}>Revolut</button>
      <button disabled={pending} onClick={() => go("bank_transfer")} className={`${btn} border-line bg-white text-ink`}>Bank</button>
      <button disabled={pending} onClick={() => go("card_in_person")} className={`${btn} border-line bg-white text-ink`}>Card</button>
    </span>
  );
}

export function RenewButtons({ membershipId, name }: { membershipId: string; name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span role="status" className="text-xs font-medium text-plum-700">{msg}</span>;
  const go = (m: "cash" | "card_in_person") => start(async () => { const r = await renewMembership(membershipId, m); setMsg(r.ok ? "Renewed ✓" : r.error); });
  return (
    <span className="flex shrink-0 gap-1.5" role="group" aria-label={`Renew ${name}'s package`}>
      <button disabled={pending} onClick={() => go("cash")} className={`${btn} border-ink bg-ink text-paper`}>Paid cash</button>
      <button disabled={pending} onClick={() => go("card_in_person")} className={`${btn} border-line bg-white text-ink`}>Card</button>
    </span>
  );
}

export function MembershipControls({ id, status, cancelAtEnd }: { id: string; status: string; cancelAtEnd: boolean }) {
  const [pending, start] = useTransition();
  const act = (a: "pause" | "resume" | "cancel" | "reactivate") => start(async () => { await setMembershipState(id, a); });
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "active" && <button disabled={pending} onClick={() => act("pause")} className={`${btn} border-line bg-white text-ink`}>Pause (injury / holiday)</button>}
      {status === "paused" && <button disabled={pending} onClick={() => act("resume")} className={`${btn} border-ink bg-ink text-paper`}>Resume (extends expiry)</button>}
      {cancelAtEnd
        ? <button disabled={pending} onClick={() => act("reactivate")} className={`${btn} border-line bg-white text-ink`}>Keep renewing</button>
        : <button disabled={pending} onClick={() => act("cancel")} className={`${btn} border-burgundy/30 bg-white text-burgundy`}>Stop at period end</button>}
    </div>
  );
}
