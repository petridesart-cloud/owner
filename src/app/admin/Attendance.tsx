"use client";
import { useOptimistic, useState, useTransition } from "react";
import { setAttendance } from "./actions";

type State = "attended" | "no_show" | "unmarked";
const OPTIONS: { value: State; label: string }[] = [
  { value: "attended", label: "Attended" }, { value: "no_show", label: "No-show" }, { value: "unmarked", label: "Not marked" },
];

/** Past classes: set (or correct) attendance at any time. Real radio buttons, so the arrow keys move between them (A-076). */
export function Attendance({ bookingId, state, name }: { bookingId: string; state: State; name: string }) {
  const [current, set] = useOptimistic(state);
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <>
    <fieldset className="mt-1.5 inline-flex rounded-full border border-line bg-white p-0.5">
      <legend className="sr-only">Attendance: {name}</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input type="radio" name={`attendance-${bookingId}`} value={o.value} checked={current === o.value} className="peer sr-only"
            onChange={() => start(async () => { setErr(null); setSaved(false); set(o.value); const r = await setAttendance(bookingId, o.value); if (!r.ok) setErr(r.error); else setSaved(true); })} />
          <span className={`flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-xs font-medium transition peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300 ${current === o.value
            ? o.value === "no_show" ? "bg-burgundy-soft text-burgundy" : o.value === "attended" ? "bg-ink text-paper" : "bg-lilac-100 text-ink"
            : "text-ink-soft hover:text-ink"}`}>
            {o.label}
          </span>
        </label>
      ))}
    </fieldset>
    {err && <p role="alert" className="mt-1 text-xs text-burgundy">{err}</p>}
    {saved && !err && <p role="status" className="mt-1 text-xs text-plum-700">Saved</p>}
    </>
  );
}
