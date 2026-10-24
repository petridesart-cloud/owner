import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthInfo } from "../../HealthInfo";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Checkbox, Field, inputClass } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { dayKey, longDate, time } from "@/lib/time";
import { cancelSessionAction, manualBook, updateSession } from "../../actions";
import { CheckInToggle } from "../../RosterControls";
import { AdminTitle } from "../../ui";
import { SessionFields } from "../SessionFields";
import { RosterActions } from "./RosterActions";
import { MarkPaid } from "../../PaymentButtons";

export const dynamic = "force-dynamic";

export default async function SessionAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: s } = await db().from("class_sessions")
    .select("*, class_types(*), bookings!bookings_session_id_fkey(id, status, paid_with, source, checked_in_at, created_at, payment_id, profiles(id, full_name, email, phone, photo_consent, health_notes(note, injuries, medication, parq_yes))), waitlist_entries(id, status, created_at, offer_expires_at, profiles(id, full_name))")
    .eq("id", id).maybeSingle();
  if (!s) notFound();
  const [{ data: types }, { data: clients }] = await Promise.all([
    db().from("class_types").select("*").order("sort_order"),
    db().from("profiles").select("id, full_name, email").is("deleted_at", null).eq("role", "client").order("full_name").limit(1000),
  ]);
  const roster = s.bookings.filter((b) => ["confirmed", "no_show"].includes(b.status));
  const other = s.bookings.filter((b) => ["cancelled", "late_cancelled", "studio_cancelled"].includes(b.status));
  const waitlist = s.waitlist_entries.filter((w) => ["waiting", "offered"].includes(w.status)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const past = new Date(s.starts_at) < new Date();
  const name = s.title ?? s.class_types?.name;
  const mins = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000);

  return (
    <div className="space-y-6">
      <AdminTitle title={`${time(s.starts_at)} ${name}`} sub={<>{longDate(s.starts_at)} · {roster.length}/{s.capacity} booked {s.status === "cancelled" && <Badge tone="full">Cancelled</Badge>}</>}
        action={<Link href={`/book/${s.id}`} className="text-sm underline underline-offset-4">Client view</Link>} />

      <section className="card overflow-hidden">
        <h2 className="display border-b border-line px-4 py-3 text-[0.95rem]">Roster</h2>
        <ul className="divide-y divide-line">
          {roster.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <CheckInToggle bookingId={b.id} checked={!!b.checked_in_at} name={b.profiles?.full_name ?? "Client"} />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/clients/${b.profiles?.id}`} className="block truncate font-medium text-ink hover:underline">{b.profiles?.full_name ?? "Client"}</Link>
                <p className="text-xs text-ink-soft">
                  {b.profiles?.photo_consent === "none" && <span className="mr-1 rounded-full bg-ink px-2 py-0.5 font-medium text-paper">No photos</span>}
                  {b.profiles?.photo_consent === "no_face" && <span className="mr-1 rounded-full bg-ink/80 px-2 py-0.5 font-medium text-paper">No face</span>}
                  {b.paid_with === "pay_at_studio" && <span className="mr-1 rounded-full bg-burgundy-soft px-2 py-0.5 font-medium text-burgundy">Unpaid</span>}
                  {b.status === "no_show" ? "No-show · " : ""}{b.paid_with === "credit" ? "Class credit" : b.paid_with === "payment" ? "Paid" : b.paid_with === "pay_at_studio" ? "Pay at studio" : "Manual"}{b.source === "manual" ? " · added by studio" : ""}
                </p>
                {b.paid_with === "pay_at_studio" && b.payment_id && <div className="mt-1.5"><MarkPaid paymentId={b.payment_id} label={b.profiles?.full_name ?? "booking"} /></div>}
                <HealthInfo h={b.profiles?.health_notes} />
              </div>
              {b.status === "confirmed" && s.status === "scheduled" && <RosterActions bookingId={b.id} sessionId={s.id} name={b.profiles?.full_name ?? "client"} past={past} />}
            </li>
          ))}
          {roster.length === 0 && <li className="px-4 py-4 text-sm text-ink-soft">Nobody booked yet.</li>}
        </ul>
        {waitlist.length > 0 && (
          <div className="border-t border-line bg-lilac-50/60 px-4 py-3 text-sm">
            <p className="eyebrow mb-1.5">Waitlist</p>
            <ol className="list-decimal space-y-1 pl-5">
              {waitlist.map((w) => <li key={w.id}>{w.profiles?.full_name}{w.status === "offered" ? ` · offered until ${time(w.offer_expires_at!)}` : ""}</li>)}
            </ol>
          </div>
        )}
        {other.length > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-soft">Cancelled: {other.map((b) => `${b.profiles?.full_name} (${b.status.replace("_", " ")})`).join(", ")}</p>}
      </section>

      {s.status === "scheduled" && (
        <section className="card px-5 py-5">
          <h2 className="display mb-1 text-[0.95rem]">Add a client</h2>
          <p className="mb-4 text-sm text-ink-soft">For bookings made by DM or phone. Ignores the online cutoff.</p>
          <ActionForm action={manualBook.bind(null, s.id)} submit="Add to class" variant="soft">
            <Field id="profile_id" label="Existing client">
              <select id="profile_id" name="profile_id" className={inputClass} defaultValue="">
                <option value="">New client…</option>
                {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name ?? c.email}{c.email ? ` · ${c.email}` : ""}</option>)}
              </select>
            </Field>
            <details className="rounded-2xl border border-line px-4 py-2">
              <summary className="min-h-10 cursor-pointer content-center text-sm font-medium">…or a new client</summary>
              <div className="mt-2 space-y-3 pb-2">
                <Field id="full_name" label="Name"><input id="full_name" name="full_name" className={inputClass} /></Field>
                <Field id="email" label="Email (optional)"><input id="email" name="email" type="email" className={inputClass} /></Field>
                <Field id="phone" label="Phone (optional)"><input id="phone" name="phone" type="tel" className={inputClass} /></Field>
              </div>
            </details>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">Payment</legend>
              <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="mode" value="manual" defaultChecked className="size-4 accent-ink" /> Paid / settled outside the app</label>
              <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="mode" value="credit" className="size-4 accent-ink" /> Use one of their credits</label>
            </fieldset>
            <Checkbox id="notify" name="notify">Email them a booking confirmation</Checkbox>
          </ActionForm>
        </section>
      )}

      <section className="card px-5 py-5">
        <h2 className="display mb-4 text-[0.95rem]">Edit class</h2>
        <ActionForm action={updateSession.bind(null, s.id)} submit="Save changes" variant="soft">
          <SessionFields types={types ?? []} d={{
            class_type_id: s.class_type_id, date: dayKey(s.starts_at), time: time(s.starts_at), duration: mins, capacity: s.capacity,
            price: s.price_cents != null ? (s.price_cents / 100).toFixed(2) : "", title: s.title, location: s.location, description: s.description,
          }} />
        </ActionForm>
      </section>

      {s.status === "scheduled" && !past && (
        <section className="card border-burgundy/25 px-5 py-5">
          <h2 className="display mb-1 text-[0.95rem] text-burgundy">Cancel class</h2>
          <p className="mb-4 text-sm text-ink-soft">Everyone booked is notified by email and SMS, and gets their credit back (card-paid events are flagged for refund).</p>
          <ActionForm action={cancelSessionAction.bind(null, s.id)} submit="Cancel this class" variant="danger" confirm="Cancel this class and notify everyone booked?">
            <Field id="reason" label="Message to clients (optional)"><input id="reason" name="reason" placeholder="e.g. Instructor unwell. So sorry!" className={inputClass} /></Field>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
