"use client";
import { useState, useTransition } from "react";
import { eur } from "@/lib/money";
import { cancelPaymentRequest, markPaid, markRefunded, renewMembership, setMembershipState } from "./actions";

const btn = "min-h-11 min-w-11 rounded-full border px-3 text-xs font-medium transition active:scale-[0.97] disabled:opacity-50";

type Method = "cash" | "card_in_person" | "revolut" | "bank_transfer";
const METHODS: readonly (readonly [Method, string])[] = [["cash", "Cash"], ["revolut", "Revolut"], ["bank_transfer", "Bank"], ["card_in_person", "Card"]];
const big = "min-h-11 min-w-11 rounded-full border px-4 text-xs font-medium transition active:scale-[0.97] disabled:opacity-50";

/** "Mark Maria: Reformer trial" → "Maria's €25 Reformer trial". */
function sentence(label: string, cents?: number) {
  const [who, what] = label.split(": ");
  const amount = cents != null ? `${eur(cents)} ` : "";
  return what ? `${who}'s ${amount}${what}` : `${label}${cents != null ? ` (${eur(cents)})` : ""}`;
}

/**
 * "Mark as paid" (A-030): one clear button for the method the client chose, the others behind "Other method",
 * and a confirm step before anything is granted (one tap writes the ledger and can't be undone here).
 */
export function MarkPaid({ paymentId, label, prefer, amountCents }: { paymentId: string; label: string; prefer?: string | null; amountCents?: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [chosen, setChosen] = useState<Method | null>(null);
  if (msg) return <span role="status" className="text-xs font-medium text-plum-700">{msg}</span>;
  const first = METHODS.find(([m]) => m === prefer) ?? METHODS[0];
  const others = METHODS.filter((x) => x !== first);
  const methodName = (m: Method) => METHODS.find(([k]) => k === m)![1];
  if (chosen) {
    return (
      <span className="flex w-full flex-col gap-2 sm:items-end" role="group" aria-label={`Confirm payment for ${label}`}>
        <span className="text-xs leading-relaxed text-ink" id={`confirm-${paymentId}`}>Mark {sentence(label, amountCents)} as paid by {methodName(chosen)}?</span>
        <span className="flex gap-2">
          <button autoFocus disabled={pending} aria-describedby={`confirm-${paymentId}`} className={`${big} border-ink bg-ink text-paper`}
            onClick={() => start(async () => { const r = await markPaid(paymentId, chosen); setMsg(r.ok ? "Paid ✓" : r.error); })}>
            {pending ? "Saving…" : "Yes, mark as paid"}
          </button>
          <button disabled={pending} onClick={() => setChosen(null)} className={`${big} border-line bg-white text-ink`}>Not yet</button>
        </span>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end" role="group" aria-label={`Mark ${label} as paid`}>
      <button onClick={() => setChosen(first[0])} className={`${big} border-ink bg-ink text-paper`}>Paid · {first[1]}</button>
      <button aria-expanded={more} onClick={() => setMore(!more)} className={`${big} border-line bg-white text-ink`}>Other method {more ? "▴" : "▾"}</button>
      {more && others.map(([m, text]) => <button key={m} onClick={() => setChosen(m)} className={`${big} border-line bg-white text-ink`}>{text}</button>)}
    </span>
  );
}

/** Remove an unpaid request (not coming / not charging). */
export function RemoveRequest({ paymentId, label }: { paymentId: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span role="status" className="text-xs font-medium text-ink-soft">{msg}</span>;
  return (
    <button disabled={pending} aria-label={`Remove request: ${label}`}
      onClick={() => confirm(`Remove this unpaid request?\n${label}`) && start(async () => { const r = await cancelPaymentRequest(paymentId); setMsg(r.ok ? "Removed" : r.error); })}
      className="min-h-11 min-w-11 rounded-full px-3 text-xs font-medium text-burgundy underline-offset-4 hover:underline disabled:opacity-50">
      Remove
    </button>
  );
}

/** "Refunded": she has paid the money back by hand (A-031). */
export function MarkRefunded({ paymentId, label }: { paymentId: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span role="status" className="text-xs font-medium text-plum-700">{msg}</span>;
  return (
    <button disabled={pending} aria-label={`Mark as refunded: ${label}`}
      onClick={() => confirm(`Have you paid this back?\n${label}`) && start(async () => { const r = await markRefunded(paymentId); setMsg(r.ok ? "Refunded ✓" : r.error); })}
      className={`${btn} shrink-0 border-ink bg-ink text-paper`}>
      Refunded
    </button>
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
