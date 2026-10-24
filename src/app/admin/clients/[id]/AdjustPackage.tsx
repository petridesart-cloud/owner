"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";

type Lot = { id: string; label: string };
type Act = "extend" | "freeze" | "end" | "add" | "remove" | "new";

const ACTIONS: { value: Act; label: string; hint: string }[] = [
  { value: "extend", label: "Extend the end date", hint: "Adds days to the package." },
  { value: "freeze", label: "Freeze", hint: "Pauses the package: the end date moves by the days frozen." },
  { value: "end", label: "End earlier", hint: "The package can be used until this date." },
  { value: "add", label: "Add classes to this package", hint: "They expire with the package." },
  { value: "remove", label: "Remove classes", hint: "Taken from this package." },
  { value: "new", label: "Give classes with their own end date", hint: "Separate from their packages, e.g. a goodwill class." },
];

/** One place to change a client's package: dates or classes. Every change is kept in the class ledger. */
export function AdjustPackage({ lots, adjustLot, giveClasses }: {
  lots: Lot[];
  adjustLot: (s: ActionResult, f: FormData) => Promise<ActionResult>;
  giveClasses: (s: ActionResult, f: FormData) => Promise<ActionResult>;
}) {
  const [act, setAct] = useState<Act>(lots.length ? "extend" : "new");
  const info = ACTIONS.find((a) => a.value === act)!;
  const needsLot = act !== "new";
  return (
    <div className="space-y-4">
      <Field id="adj-action" label="What do you want to do?" hint={info.hint}>
        <select id="adj-action" value={act} onChange={(e) => setAct(e.target.value as Act)} className={inputClass}>
          {ACTIONS.filter((a) => a.value === "new" || lots.length).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </Field>
      <ActionForm key={act} action={needsLot ? adjustLot : giveClasses} submit="Save change" variant="soft">
        <input type="hidden" name="action" value={act} />
        {needsLot && (
          <Field id="adj-lot" label="Package">
            <select id="adj-lot" name="lot" className={inputClass}>{lots.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
          </Field>
        )}
        {act === "new" && (
          <Field id="adj-kind" label="Type">
            <select id="adj-kind" name="kind" className={inputClass}><option value="reformer">Reformer</option><option value="mat">Mat</option></select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          {(act === "extend" || act === "freeze") && <Field id="adj-n" label="Days"><input id="adj-n" name="amount" type="number" min={1} max={365} defaultValue={7} className={inputClass} /></Field>}
          {act === "freeze" && <Field id="adj-date" label="From (optional)"><input id="adj-date" name="date" type="date" className={inputClass} /></Field>}
          {act === "end" && <Field id="adj-date" label="Last day"><input id="adj-date" name="date" type="date" required className={inputClass} /></Field>}
          {(act === "add" || act === "remove" || act === "new") && <Field id="adj-n" label="Classes"><input id="adj-n" name="amount" type="number" min={1} max={50} defaultValue={1} className={inputClass} /></Field>}
          {act === "new" && <Field id="adj-date" label="Valid until"><input id="adj-date" name="date" type="date" required className={inputClass} /></Field>}
        </div>
        <Field id="adj-reason" label="Reason (kept in their history)">
          <input id="adj-reason" name="reason" required placeholder={act === "freeze" ? "Injury, travelling…" : "Missed class: public holiday"} className={inputClass} />
        </Field>
      </ActionForm>
    </div>
  );
}
