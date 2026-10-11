"use client";
import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { toggleCheckIn } from "./actions";

export function CheckInToggle({ bookingId, checked, name }: { bookingId: string; checked: boolean; name: string }) {
  const [optimistic, set] = useOptimistic(checked);
  const [, start] = useTransition();
  return (
    <button
      role="switch"
      aria-checked={optimistic}
      aria-label={`Checked in: ${name}`}
      onClick={() => start(async () => { set(!optimistic); await toggleCheckIn(bookingId, !optimistic); })}
      className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${optimistic ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink-soft hover:border-lilac-300"}`}
    >
      <Check aria-hidden size={18} strokeWidth={optimistic ? 2.4 : 1.6} />
    </button>
  );
}
