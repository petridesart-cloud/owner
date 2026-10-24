"use client";
import { useActionState } from "react";
import { Button, Notice } from "@/components/ui";
import { saveWeekly, type WeeklyState } from "./actions";
import { keepValues } from "@/lib/keep-form";

type Slot = { key: string; day: string; time: string; name: string; disabled: boolean };

export function WeeklyForm({ groups, chosen }: { groups: { day: string; slots: Slot[] }[]; chosen: string[] }) {
  const [state, action, pending] = useActionState<WeeklyState, FormData>(saveWeekly, { ok: false });
  return (
    <form onSubmit={keepValues(action)} className="space-y-5">
      {groups.map((g) => (
        <fieldset key={g.day}>
          <legend className="eyebrow mb-2">{g.day}</legend>
          <div className="flex flex-wrap gap-2">
            {g.slots.map((s) => (
              <label key={s.key} className={`relative ${s.disabled ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" name="slot" value={s.key} defaultChecked={chosen.includes(s.key)} disabled={s.disabled} className="peer sr-only" />
                <span className="flex min-h-12 min-w-20 flex-col items-center justify-center rounded-2xl border border-line bg-white px-4 py-2 text-ink transition peer-checked:border-plum-700 peer-checked:bg-mauve peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300">
                  <span className="font-serif text-xl leading-none">{s.time}</span>
                  {s.name && <span className="mt-0.5 text-xs text-ink-soft">{s.name}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save my weekly classes"}</Button>
    </form>
  );
}
