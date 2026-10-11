import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { dayMonth, todayKey } from "@/lib/time";
import { createClosure } from "../actions";
import { AdminTitle } from "../ui";
import { ClosureActions } from "./ClosureActions";

export const dynamic = "force-dynamic";

export default async function ClosuresPage() {
  const today = todayKey();
  const { data: rows } = await db().from("closures").select("*").gte("ends_on", today).order("starts_on");
  const confirmed = (rows ?? []).filter((r) => r.confirmed);
  const suggested = (rows ?? []).filter((r) => !r.confirmed);
  const range = (r: { starts_on: string; ends_on: string }) => r.starts_on === r.ends_on ? dayMonth(`${r.starts_on}T12:00:00Z`) : `${dayMonth(`${r.starts_on}T12:00:00Z`)} – ${dayMonth(`${r.ends_on}T12:00:00Z`)}`;
  return (
    <div className="space-y-6">
      <AdminTitle title="Closures" sub="Christmas, Easter, Summer and public holidays. Active packages freeze: their expiry moves by the closed days." />
      <section className="card px-5 py-5">
        <h2 className="display mb-4 text-[0.95rem]">Add a closure</h2>
        <ActionForm action={createClosure} submit="Close the studio for these dates" confirm="This cancels any classes in these dates and notifies booked clients. Continue?">
          <Field id="name" label="Name"><input id="name" name="name" placeholder="Christmas break" className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="starts_on" label="From"><input id="starts_on" name="starts_on" type="date" className={inputClass} /></Field>
            <Field id="ends_on" label="To (inclusive)"><input id="ends_on" name="ends_on" type="date" className={inputClass} /></Field>
          </div>
        </ActionForm>
      </section>
      <section className="card overflow-hidden">
        <h2 className="display border-b border-line px-4 py-3 text-[0.95rem]">Confirmed</h2>
        <ul className="divide-y divide-line text-sm">
          {confirmed.map((r) => <li key={r.id} className="flex justify-between px-4 py-2.5"><span className="text-ink">{r.name}</span><span className="text-ink-soft">{range(r)}</span></li>)}
          {confirmed.length === 0 && <li className="px-4 py-3 text-ink-soft">None yet.</li>}
        </ul>
      </section>
      {suggested.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="display border-b border-line px-4 py-3 text-[0.95rem]">Suggested public holidays</h2>
          <p className="px-4 pt-3 text-xs text-ink-soft">Cyprus public holidays for the next 12 months. Check dates against the official calendar before confirming.</p>
          <ul className="divide-y divide-line text-sm">
            {suggested.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span><span className="text-ink">{r.name}</span><span className="block text-xs text-ink-soft">{range(r)}</span></span>
                <ClosureActions id={r.id} name={r.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
