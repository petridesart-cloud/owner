"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import { cancelAction } from "./actions";

export function CancelButton({ bookingId, late, label, warning }: { bookingId: string; late: boolean; label: string; warning: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button variant={late ? "ghost" : "danger"} className="min-h-11 w-full text-[0.72rem]" onClick={() => setConfirming(true)} aria-label={label}>
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
          const res = await cancelAction(bookingId);
          if (!res.ok) setError(res.error); else router.refresh();
        })}>{pending ? "Cancelling…" : "Yes, cancel"}</Button>
      </div>
    </div>
  );
}
