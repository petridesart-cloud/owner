import { Checkbox, Field, inputClass } from "@/components/ui";

type Type = { id: string; name: string; default_capacity: number; default_duration_minutes: number };
type Defaults = { class_type_id?: string; date?: string; time?: string; duration?: number; capacity?: number; price?: string; title?: string | null; location?: string | null; description?: string | null;
  clients_only?: boolean; what_to_bring?: string | null; event_policy?: string | null; recap?: string | null };

export function SessionFields({ types, d = {}, event = false }: { types: Type[]; d?: Defaults; event?: boolean }) {
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
      <Field id="capacity" label="Spots"><input id="capacity" name="capacity" type="number" min={1} max={100} required defaultValue={d.capacity ?? 3} className={inputClass} /></Field>
      <div className="col-span-2"><Field id="price" label="Price (€)" hint="Leave empty to use the class type's price. For events, the event fee."><input id="price" name="price" inputMode="decimal" defaultValue={d.price} className={inputClass} /></Field></div>
      <div className="col-span-2"><Field id="title" label="Title (events)" hint="e.g. SUP Pilates or Brunch & Pilates. Leave empty for regular classes."><input id="title" name="title" defaultValue={d.title ?? ""} className={inputClass} /></Field></div>
      <div className="col-span-2"><Field id="location" label="Location"><input id="location" name="location" defaultValue={d.location ?? ""} className={inputClass} /></Field></div>
      <div className="col-span-2"><Field id="description" label="Description"><textarea id="description" name="description" rows={3} defaultValue={d.description ?? ""} className={`${inputClass} py-3`} /></Field></div>
      <details open={event} className="col-span-2 rounded-2xl border border-line px-4 py-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ink">Event options</summary>
        <div className="space-y-4 pb-3 pt-2">
          <Checkbox id="clients_only" name="clients_only" defaultChecked={d.clients_only}>
            Clients only: others see it blurred and can&apos;t sign up. Clients are people who have bought a package or class, or come to a class.
          </Checkbox>
          <Field id="what_to_bring" label="What to bring (optional)" hint="One item per line. Leave empty to hide the section.">
            <textarea id="what_to_bring" name="what_to_bring" rows={3} defaultValue={d.what_to_bring ?? ""} className={`${inputClass} py-3`} />
          </Field>
          <Field id="event_policy" label="Event terms (optional)" hint="Payment, refunds, weather… Shown instead of the studio's cancellation policy.">
            <textarea id="event_policy" name="event_policy" rows={3} defaultValue={d.event_policy ?? ""} className={`${inputClass} py-3`} />
          </Field>
          <Field id="recap" label="After the event (optional)" hint="A few words for Previous events, shown with the photos you add below.">
            <textarea id="recap" name="recap" rows={2} defaultValue={d.recap ?? ""} className={`${inputClass} py-3`} />
          </Field>
        </div>
      </details>
    </div>
  );
}
