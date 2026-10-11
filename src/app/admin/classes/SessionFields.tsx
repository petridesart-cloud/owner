import { Field, inputClass } from "@/components/ui";

type Type = { id: string; name: string; default_capacity: number; default_duration_minutes: number };
type Defaults = { class_type_id?: string; date?: string; time?: string; duration?: number; capacity?: number; price?: string; title?: string | null; location?: string | null; description?: string | null };

export function SessionFields({ types, d = {} }: { types: Type[]; d?: Defaults }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field id="class_type_id" label="Class type">
          <select id="class_type_id" name="class_type_id" defaultValue={d.class_type_id ?? types[0]?.id} className={inputClass}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <Field id="date" label="Date"><input id="date" name="date" type="date" required defaultValue={d.date} className={inputClass} /></Field>
      <Field id="time" label="Start time"><input id="time" name="time" type="time" required defaultValue={d.time} step={300} className={inputClass} /></Field>
      <Field id="duration" label="Minutes"><input id="duration" name="duration" type="number" min={10} max={600} required defaultValue={d.duration ?? 50} className={inputClass} /></Field>
      <Field id="capacity" label="Capacity"><input id="capacity" name="capacity" type="number" min={1} max={100} required defaultValue={d.capacity ?? 3} className={inputClass} /></Field>
      <div className="col-span-2"><Field id="price" label="Price override (€)" hint="Leave empty to use the class type's price."><input id="price" name="price" inputMode="decimal" defaultValue={d.price} className={inputClass} /></Field></div>
      <div className="col-span-2"><Field id="title" label="Title (events)" hint="e.g. SUP Pilates or Brunch & Pilates"><input id="title" name="title" defaultValue={d.title ?? ""} className={inputClass} /></Field></div>
      <div className="col-span-2"><Field id="location" label="Location"><input id="location" name="location" defaultValue={d.location ?? ""} className={inputClass} /></Field></div>
      <div className="col-span-2"><Field id="description" label="Description"><textarea id="description" name="description" rows={3} defaultValue={d.description ?? ""} className={`${inputClass} py-3`} /></Field></div>
    </div>
  );
}
