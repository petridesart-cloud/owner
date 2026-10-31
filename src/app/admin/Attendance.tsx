"use client";
import { useOptimistic, useTransition } from "react";
import { setAttendance } from "./actions";

type State = "attended" | "no_show" | "unmarked";
const OPTIONS: { value: State; label: string }[] = [
  { value: "attended", label: "Attended" }, { value: "no_show", label: "No-show" }, { value: "unmarked", label: "Not marked" },
];

/** Past classes: set (or correct) attendance at any time. */
export function Attendance({ bookingId, state, name }: { bookingId: string; state: State; name: string }) {
  const [current, set] = useOptimistic(state);
  const [, start] = useTransition();
  return (
    <div role="radiogroup" aria-label={`Attendance: ${name}`} className="mt-1.5 inline-flex rounded-full border border-line bg-white p-0.5">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={current === o.value}
          onClick={() => start(async () => { set(o.value); await setAttendance(bookingId, o.value); })}
          className={`min-h-9 rounded-full px-3 text-xs font-medium transition ${current === o.value
            ? o.value === "no_show" ? "bg-burgundy-soft text-burgundy" : o.value === "attended" ? "bg-ink text-paper" : "bg-lilac-100 text-ink"
            : "text-ink-soft hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
