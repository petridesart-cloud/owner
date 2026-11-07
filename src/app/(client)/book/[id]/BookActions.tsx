"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, inputClass } from "@/components/ui";
import { withDiscount, type Discount } from "@/lib/discount";
import { bookAction, checkSingleCodeAction, joinWaitlistAction, leaveWaitlistAction } from "./actions";

type Props =
  | {
      mode: "book"; sessionId: string; priceLabel: string; credits: number; creditKind: string | null; creditCost: number; online: boolean; payLater: boolean; offered?: boolean;
      /** Reserve now, pay by cash or Revolut: trial (first class of this type), drop-in, or a paid event. */
      singles?: { mode: "trial" | "drop_in"; target: "trial" | "drop_in" | "event"; label: string; price: string; cents: number }[];
      /** Her rewards for this client that work here; applied by themselves. */
      rewards?: Discount[];
      creditLabel?: string;
      /** A free event (€0): one tap, no payment question. */
      free?: boolean;
      /** The event's question for people booking (e.g. dietary needs). */
      question?: string | null;
    }
  | { mode: "waitlist"; sessionId: string }
  | { mode: "leave"; sessionId: string; entryId: string };

export function BookActions(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A-020: a lost response on a phone (the request may still have gone through) shows a calm notice,
  // never the "Application error" screen, and refreshes so the page shows what really happened.
  const LOST = "We lost the connection. Check My classes before trying again.";
  const safely = (fn: () => Promise<void>) => start(async () => {
    try { await fn(); } catch { setError(LOST); router.refresh(); }
  });
  const go = (url: string) => (url.startsWith("http") ? window.location.assign(url) : router.push(url));

  const [payBy, setPayBy] = useState<"cash" | "revolut">("cash");
  const [answer, setAnswer] = useState("");
  const rewards = props.mode === "book" ? props.rewards ?? [] : [];
  const [discount, setDiscount] = useState<Discount | null>(rewards[0] ?? null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const book = (method: "credit" | "pay" | "studio" | "trial" | "drop_in" | "free", useCode: string | null = null) =>
    safely(async () => {
      setError(null);
      const res = await bookAction(props.sessionId, method, payBy, answer, useCode);
      if (!res.ok) { setError(res.error); router.refresh(); return; }
      go(res.data!.redirect);
    });

  if (props.mode === "waitlist") {
    return (
      <div className="space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        <Button className="w-full" disabled={pending} onClick={() => safely(async () => {
          const res = await joinWaitlistAction(props.sessionId);
          if (!res.ok) setError(res.error); else router.refresh();
        })}>
          {pending ? "Joining…" : "Join the waitlist"}
        </Button>
      </div>
    );
  }

  if (props.mode === "leave") {
    return (
      <div className="space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <Button variant="ghost" className="w-full" disabled={pending} onClick={() => safely(async () => {
          const res = await leaveWaitlistAction(props.entryId, props.sessionId);
          if (!res.ok) setError(res.error); else { setMessage("You've left the waitlist."); router.refresh(); }
        })}>
          Leave waitlist
        </Button>
      </div>
    );
  }

  const question = props.question ? (
    <div>
      <label htmlFor="answer" className="mb-1.5 block text-sm font-medium text-ink">{props.question}</label>
      <textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={500} rows={2}
        className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[0.95rem] text-ink focus:border-plum-700 focus:outline-none focus:ring-2 focus:ring-lilac-300" />
    </div>
  ) : null;
  if (props.free) {
    return (
      <div className="space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        {question}
        <Button className="w-full" disabled={pending} onClick={() => book("free")}>{pending ? "Booking…" : "Book your free spot"}</Button>
      </div>
    );
  }
  const canUseCredit = !!props.creditKind && props.credits >= props.creditCost;
  const classes = (n: number) => `${n} ${props.creditLabel ?? props.creditKind} class${n === 1 ? "" : "es"}`;
  const singles = !canUseCredit && !props.online ? props.singles ?? [] : [];
  if (singles.length) {
    return (
      <div className="space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        {question}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">How will you pay?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["cash", "revolut"] as const).map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="radio" name="payBy" value={m} checked={payBy === m} onChange={() => setPayBy(m)} className="peer sr-only" />
                <span className="flex min-h-12 items-center justify-center rounded-full border border-line bg-white px-4 text-sm font-medium text-ink transition peer-checked:border-plum-700 peer-checked:bg-lilac-100 peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300">
                  {m === "cash" ? "Cash" : "Revolut"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {discount ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-mauve-soft px-4 py-3">
            <p className="text-sm font-medium text-ink">{discount.personal ? "Your reward" : `Code ${discount.code}`}: {discount.label}</p>
            <button type="button" onClick={() => setDiscount(null)} className="min-h-11 shrink-0 text-sm font-medium text-ink underline underline-offset-4">Remove</button>
          </div>
        ) : codeOpen ? (
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink">Discount code</label>
            <div className="flex gap-2">
              <input id="code" value={code} onChange={(e) => { setCode(e.target.value); setCodeError(null); }} autoCapitalize="characters" autoComplete="off" spellCheck={false}
                aria-invalid={!!codeError} aria-describedby={codeError ? "code-error" : undefined} className={`${inputClass} uppercase`} />
              <Button type="button" variant="soft" disabled={pending || !code.trim()} className="shrink-0 px-5" onClick={() => safely(async () => {
                const res = await checkSingleCodeAction(props.sessionId, singles.map((o) => o.mode), code);
                if (!res.ok) { setCodeError(res.error); return; }
                setDiscount(res.data!); setCodeOpen(false); setCode("");
              })}>Apply</Button>
            </div>
            {codeError && <p id="code-error" role="alert" className="mt-1.5 text-xs font-medium text-burgundy">{codeError}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setCodeOpen(true)} className="min-h-11 text-sm text-ink-soft underline underline-offset-4">Have a code?</button>
        )}
        {singles.map((o, i) => {
          const fits = !!discount && discount.appliesTo.includes(o.target);
          const d = fits ? withDiscount(o.cents, o.cents, discount) : null;
          const cents = d?.applies ? d.cents : o.cents;
          return (
            <Button key={o.mode} variant={i === 0 ? "primary" : "ghost"} className="w-full" disabled={pending} onClick={() => book(o.mode, d?.applies ? discount!.code : null)}>
              {pending ? "Reserving…" : `${o.label} · ${d?.applies ? `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : o.price}`}
            </Button>
          );
        })}
        <p className="text-center text-sm text-ink-soft">Your spot is reserved now. Pay {payBy === "cash" ? "in cash at the studio" : "by Revolut"} before class.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      {canUseCredit && (
        <Button className="w-full" disabled={pending} onClick={() => book("credit")}>
          {pending ? "Securing…" : props.creditCost > 1 ? `Use ${props.creditCost} classes` : "Secure your spot · 1 class"}
        </Button>
      )}
      {props.online ? (
        <Button variant={canUseCredit ? "ghost" : "primary"} className="w-full" disabled={pending} onClick={() => book("pay")}>
          {pending && !canUseCredit ? "Opening checkout…" : `Pay ${props.priceLabel}`}
        </Button>
      ) : props.payLater ? (
        <Button variant={canUseCredit ? "ghost" : "primary"} className="w-full" disabled={pending} onClick={() => book("studio")}>
          {pending && !canUseCredit ? "Reserving…" : `Reserve · pay ${props.priceLabel} at the studio`}
        </Button>
      ) : null}
      <p className="text-center text-sm text-ink-soft">
        {canUseCredit ? `You have ${classes(props.credits)} left.` : props.online ? "Card, Apple Pay or Google Pay via secure checkout." : "Cash or card at the studio, before class."}
      </p>
    </div>
  );
}
