"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import { bookAction, joinWaitlistAction, leaveWaitlistAction } from "./actions";

type Props =
  | { mode: "book"; sessionId: string; priceLabel: string; credits: number; creditKind: string | null; creditCost: number; online: boolean; payLater: boolean; offered?: boolean }
  | { mode: "waitlist"; sessionId: string }
  | { mode: "leave"; sessionId: string; entryId: string };

export function BookActions(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (url: string) => (url.startsWith("http") ? window.location.assign(url) : router.push(url));

  const book = (method: "credit" | "pay" | "studio") =>
    start(async () => {
      setError(null);
      const res = await bookAction(props.sessionId, method);
      if (!res.ok) { setError(res.error); router.refresh(); return; }
      go(res.data!.redirect);
    });

  if (props.mode === "waitlist") {
    return (
      <div className="space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        <Button className="w-full" disabled={pending} onClick={() => start(async () => {
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
        <Button variant="ghost" className="w-full" disabled={pending} onClick={() => start(async () => {
          const res = await leaveWaitlistAction(props.entryId, props.sessionId);
          if (!res.ok) setError(res.error); else { setMessage("You've left the waitlist."); router.refresh(); }
        })}>
          Leave waitlist
        </Button>
      </div>
    );
  }

  const canUseCredit = !!props.creditKind && props.credits >= props.creditCost;
  const classes = (n: number) => `${n} ${props.creditKind} class${n === 1 ? "" : "es"}`;
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
