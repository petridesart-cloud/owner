"use client";
import { keepValues } from "@/lib/keep-form";
import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";
import { saveTimetable } from "../actions";

type Slot = { weekday: number; time: string; class_type_id: string };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function Builder({ types, initial, defaults }: {
  types: { id: string; name: string }[]; initial: Slot[]; defaults: { name: string; from: string };
}) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [draft, setDraft] = useState<Record<number, { time: string; type: string }>>({});
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTimetable, { ok: true });
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Class";

  const add = (day: number) => {
    const d = draft[day] ?? { time: "", type: types[0]?.id };
    if (!/^\d{2}:\d{2}$/.test(d.time)) return;
    setSlots((s) => [...s.filter((x) => !(x.weekday === day && x.time === d.time)), { weekday: day, time: d.time, class_type_id: d.type ?? types[0].id }]);
    setDraft((x) => ({ ...x, [day]: { ...d, time: "" } }));
  };

  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      <input type="hidden" name="slots" value={JSON.stringify(slots)} />
      <div className="card grid grid-cols-2 gap-3 px-4 py-4">
        <div className="col-span-2"><Field id="valid_from" label="Starts on" hint="Repeats every week from this date, month after month, until you save a new one."><input id="valid_from" name="valid_from" type="date" defaultValue={defaults.from} className={inputClass} /></Field></div>
        <input type="hidden" name="name" value={defaults.name} />
      </div>

      {DAYS.map((label, i) => {
        const day = i + 1;
        const list = slots.filter((s) => s.weekday === day).sort((a, b) => a.time.localeCompare(b.time));
        const d = draft[day] ?? { time: "", type: types[0]?.id };
        return (
          <fieldset key={day} className="card px-4 py-3.5">
            <legend className="sr-only">{label}</legend>
            <p className="display text-[0.9rem] text-ink" aria-hidden>{label}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {list.map((s) => (
                <li key={s.time} className="inline-flex items-center gap-1 rounded-full bg-lilac-100 py-1 pl-3 pr-1 text-sm text-ink">
                  <span className="font-medium">{s.time}</span>
                  {types.length > 1 && <span className="text-xs text-ink-soft">{typeName(s.class_type_id).split(" ")[0]}</span>}
                  <button type="button" onClick={() => setSlots((x) => x.filter((y) => !(y.weekday === day && y.time === s.time)))}
                    className="grid size-8 place-items-center rounded-full hover:bg-white" aria-label={`Remove ${label} ${s.time}`}>
                    <X aria-hidden size={14} />
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="text-sm text-ink-soft">No classes</li>}
            </ul>
            <div className="mt-2.5 flex gap-2">
              <label className="sr-only" htmlFor={`t-${day}`}>New time on {label}</label>
              <input id={`t-${day}`} type="time" step={300} value={d.time} onChange={(e) => setDraft((x) => ({ ...x, [day]: { ...d, time: e.target.value } }))}
                className="min-h-11 w-28 rounded-xl border border-line bg-white px-2 text-ink" />
              <label className="sr-only" htmlFor={`c-${day}`}>Class type</label>
              <select id={`c-${day}`} value={d.type} onChange={(e) => setDraft((x) => ({ ...x, [day]: { ...d, type: e.target.value } }))}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-2 text-sm text-ink">
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => add(day)} className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper" aria-label={`Add time to ${label}`}>
                <Plus aria-hidden size={18} />
              </button>
            </div>
          </fieldset>
        );
      })}

      {!state.ok && <Notice tone="error">{state.error}</Notice>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating classes…" : `Save · ${slots.length} classes every week`}</Button>
    </form>
  );
}
