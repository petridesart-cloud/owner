"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import { cancelAction } from "./actions";

/** `outcome` is what to tell them afterwards: "credit" (class back in the package), "free" (nothing to pay) or "late" (released to the waitlist). */
export function CancelButton({ bookingId, late, label, warning, outcome }: { bookingId: string; late: boolean; label: string; warning: string; outcome: "credit" | "free" | "late" }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button variant={late ? "ghost" : "danger"} className="min-h-11 w-full text-[0.72rem]" onClick={() => setConfirming(true)} aria-label={`${late ? "Release my spot" : "Cancel booking"}, ${label}`}>
        {late ? "Release my spot" : "Cancel booking"}
      </Button>
    );
  }
  return (
    <div className="space-y-2" role="group" aria-label="Confirm cancellation">
      <p className="text-xs leading-relaxed text-ink-soft">{warning}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 flex-1 text-[0.72rem]" onClick={() => setConfirming(false)} disabled={pending}>Keep it</Button>
        <Button variant="danger" className="min-h-11 flex-1 text-[0.72rem]" disabled={pending} autoFocus onClick={() => start(async () => {
          try {
            const res = await cancelAction(bookingId);
            if (!res.ok) setError(res.error); else router.replace(`/bookings?cancelled=${outcome}`);
          } catch {
            // A-020: the cancellation may have gone through; refresh shows the real state.
            setError("We lost the connection. Check My classes before trying again.");
            router.refresh();
          }
        })}>{pending ? "Cancelling…" : "Yes, cancel"}</Button>
      </div>
    </div>
  );
}
