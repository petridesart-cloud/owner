"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Checkbox, Field, inputClass } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";

type Kind = "percent" | "amount" | "free_classes";
const KINDS: { value: Kind; label: string; unit: string; hint: string; def: number; max: number }[] = [
  { value: "percent", label: "% off their next package", unit: "Percent", hint: "Off the full price. Doesn't add to the student discount: they get whichever is bigger.", def: 10, max: 100 },
  { value: "amount", label: "€ off their next package", unit: "Euro", hint: "Taken off the full price.", def: 10, max: 1000 },
  { value: "free_classes", label: "Free classes with their next package", unit: "Classes", hint: "Added to the package when you mark it as paid.", def: 1, max: 10 },
];

/** Give a personal reward (client page) or create a code anyone can type (Discount codes). */
export function DiscountForm({ action, code = false }: { action: (s: ActionResult, f: FormData) => Promise<ActionResult>; code?: boolean }) {
  const [kind, setKind] = useState<Kind>("percent");
  const k = KINDS.find((x) => x.value === kind)!;
  return (
    <ActionForm action={action} submit={code ? "Create code" : "Give reward"} variant="soft">
      {code && (
        <Field id="dc-code" label="Code" hint="What clients type, e.g. SUMMER10. Letters and numbers.">
          <input id="dc-code" name="code" required maxLength={24} autoCapitalize="characters" autoComplete="off" spellCheck={false} className={`${inputClass} uppercase`} />
        </Field>
      )}
      <Field id="dc-kind" label="What it gives" hint={k.hint}>
        <select id="dc-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputClass}>
          {KINDS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="dc-value" label={k.unit}>
          <input key={kind} id="dc-value" name="value" type="number" inputMode="decimal" min={1} max={k.max} step={kind === "amount" ? "0.5" : 1} defaultValue={k.def} required className={inputClass} />
        </Field>
        <Field id="dc-until" label="Use by (optional)">
          <input id="dc-until" name="expires_on" type="date" className={inputClass} />
        </Field>
      </div>
      {code && (
        <Field id="dc-max" label="How many times in total (optional)" hint="Each client can use a code once. Leave empty for no limit.">
          <input id="dc-max" name="max_uses" type="number" inputMode="numeric" min={1} max={1000} className={inputClass} />
        </Field>
      )}
      <Field id="dc-note" label={code ? "Note (only you see it)" : "Why (only you see it)"}>
        <input id="dc-note" name="note" maxLength={200} placeholder={code ? "Summer offer on Instagram" : "Brought a friend, 20 classes…"} className={inputClass} />
      </Field>
      {!code && <Checkbox id="dc-tell" name="tell" defaultChecked>Email them about it</Checkbox>}
    </ActionForm>
  );
}
