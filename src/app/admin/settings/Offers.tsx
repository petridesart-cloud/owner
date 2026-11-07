"use client";
import { useState, useTransition } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";

type Kind = { key: string; label: string };
const NEW = "__new__";

/** The fields of a new class type (no <form>: it lives inside the package form and saves on its own button). */
function NewClassType({ onCreated, onCancel, create }: {
  onCreated: (k: Kind) => void; onCancel: () => void;
  create: (raw: Record<string, string>) => Promise<ActionResult<Kind>>;
}) {
  const [v, setV] = useState({ name: "", default_capacity: "3", default_duration_minutes: "50", credit_cost: "1", default_location: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="space-y-3 rounded-2xl border border-lilac-300 bg-lilac-50 p-4" role="group" aria-label="New class type">
      <p className="text-sm font-medium text-ink">New class type</p>
      <p className="-mt-2 text-xs text-ink-soft">It gets its own packages and appears under Class types, where you can change it later.</p>
      <Field id="nct-name" label="Name"><input id="nct-name" value={v.name} onChange={set("name")} placeholder="e.g. Pre and post natal" className={inputClass} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="nct-cap" label="Spots"><input id="nct-cap" type="number" min={1} max={100} value={v.default_capacity} onChange={set("default_capacity")} className={inputClass} /></Field>
        <Field id="nct-min" label="Minutes"><input id="nct-min" type="number" min={10} max={600} value={v.default_duration_minutes} onChange={set("default_duration_minutes")} className={inputClass} /></Field>
        <Field id="nct-cost" label="Classes used"><input id="nct-cost" type="number" min={1} max={10} value={v.credit_cost} onChange={set("credit_cost")} className={inputClass} /></Field>
      </div>
      <Field id="nct-loc" label="Default location (optional)"><input id="nct-loc" value={v.default_location} onChange={set("default_location")} className={inputClass} /></Field>
      <Field id="nct-desc" label="Description (optional)"><textarea id="nct-desc" rows={2} value={v.description} onChange={set("description")} className={`${inputClass} py-3`} /></Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => {
          const res = await create(v);
          if (!res.ok) return setError(res.error);
          onCreated(res.data!);
        })}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

/** "For": every class type with its own packages, plus "+ New class type". */
function ForPicker({ kinds: initial, create }: { kinds: Kind[]; create: (raw: Record<string, string>) => Promise<ActionResult<Kind>> }) {
  const [kinds, setKinds] = useState(initial);
  const [value, setValue] = useState(initial[0]?.key ?? NEW);
  const [added, setAdded] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Field id="offer-for" label="For" hint="Which classes it's for. Clients see one tab per class type on the Packages page.">
        <select id="offer-for" name="credit_kind" value={value} onChange={(e) => { setValue(e.target.value); setAdded(null); }} className={inputClass}>
          {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          <option value={NEW}>+ New class type…</option>
        </select>
      </Field>
      {value === NEW && (
        <NewClassType create={create} onCancel={() => setValue(kinds[0]?.key ?? NEW)}
          onCreated={(k) => { setKinds([...kinds, k]); setValue(k.key); setAdded(k.label); }} />
      )}
      {added && <Notice tone="success">{added} added. It&apos;s under Class types too.</Notice>}
    </div>
  );
}

/** "+ Add": a package (as before) or a single class (trial / drop-in) with her own name. */
export function AddOffer({ kinds, addProduct, createClassType }: {
  kinds: Kind[];
  addProduct: (s: ActionResult, f: FormData) => Promise<ActionResult>;
  createClassType: (raw: Record<string, string>) => Promise<ActionResult<Kind>>;
}) {
  const [type, setType] = useState<"package" | "single">("package");
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="What are you adding?" className="grid grid-cols-2 gap-2">
        {([["package", "Package"], ["single", "Single class"]] as const).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setType(v)}
            className={`min-h-12 rounded-full border text-sm font-medium transition ${type === v ? "border-plum-700 bg-lilac-100 text-ink" : "border-line bg-white text-ink-soft"}`}>
            {label}
          </button>
        ))}
      </div>
      <ActionForm key={type} action={addProduct} submit={type === "single" ? "Save single class" : "Save package"} variant="soft">
        <input type="hidden" name="type" value={type} />
        {type === "single" && (
          <>
            <Field id="offer-tag" label="Kind" hint="A trial is only for someone's first class of this type.">
              <select id="offer-tag" name="tag" defaultValue="trial" className={inputClass}><option value="trial">Trial</option><option value="drop_in">Drop-in</option></select>
            </Field>
            <Field id="offer-name" label="Name"><input id="offer-name" name="name" maxLength={80} placeholder="e.g. Pre and Post Natal Reformer Trial" className={inputClass} /></Field>
          </>
        )}
        <ForPicker kinds={kinds} create={createClassType} />
        {type === "package" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="offer-credits" label="Classes"><input id="offer-credits" name="credits" type="number" min={1} max={200} defaultValue={8} className={inputClass} /></Field>
            <Field id="offer-months" label="Months"><input id="offer-months" name="months" type="number" min={1} max={12} defaultValue={1} className={inputClass} /></Field>
            <Field id="offer-valid" label="Valid (days)" hint="From the first class"><input id="offer-valid" name="validity_days" type="number" min={1} max={366} defaultValue={30} className={inputClass} /></Field>
            <Field id="offer-price" label="Price €"><input id="offer-price" name="price" inputMode="decimal" placeholder="e.g. 130" className={inputClass} /></Field>
          </div>
        ) : (
          <Field id="offer-price" label="Price €"><input id="offer-price" name="price" inputMode="decimal" placeholder="e.g. 25" className={inputClass} /></Field>
        )}
        <Field id="offer-desc" label="Short description (optional)"><input id="offer-desc" name="description" maxLength={300} className={inputClass} /></Field>
        <Field id="offer-sale" label="On sale">
          <select id="offer-sale" name="active" defaultValue="on" className={inputClass}><option value="on">Yes, clients can see it</option><option value="off">Not yet</option></select>
        </Field>
      </ActionForm>
    </div>
  );
}
