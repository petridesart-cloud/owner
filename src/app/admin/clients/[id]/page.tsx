import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Field, inputClass } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { creditBalance } from "@/lib/data";
import { dayMonth, dotDate, longDate, time, todayKey } from "@/lib/time";
import { HealthInfo } from "../../HealthInfo";
import { PHOTO_CONSENT, type PhotoConsent } from "@/lib/photo-consent";
import { ageOn } from "@/lib/profile";
import { eur } from "@/lib/money";
import { adjustCredits, changeMembershipProduct, clearanceReceived, holidayReturn, setStudent, updateClient } from "../../actions";
import { MarkPaid, MembershipControls, RenewButtons } from "../../PaymentButtons";
import { AdminTitle, Stat } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: c } = await db().from("profiles").select("*, health_notes(note, injuries, medication, parq_yes, conditions, details, pregnancy, pregnancy_weeks, postpartum_months, bp_meds, clearance_needed, clearance_received_at, consent_at)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: membership }, { data: monthly }, { data: ledger }] = await Promise.all([
    db().from("memberships").select("*, products!memberships_product_id_fkey(name, credits, price_cents), next:products!memberships_next_product_id_fkey(name)").eq("profile_id", id).in("status", ["active", "paused", "past_due"]).maybeSingle(),
    db().from("products").select("id, name").eq("kind", "membership").eq("active", true).order("sort_order"),
    db().from("credit_ledger").select("id, delta, entry_type, credit_kind, note, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const [credits, { data: bookings }, { data: lots }, { data: payments }, { data: consents }] = await Promise.all([
    creditBalance(id),
    db().from("bookings").select("id, status, paid_with, checked_in_at, class_sessions(id, starts_at, title, class_types(name))").eq("profile_id", id).neq("status", "expired").order("created_at", { ascending: false }).limit(50),
    db().from("credit_lots").select("*").eq("profile_id", id).order("created_at", { ascending: false }),
    db().from("payments").select("*").eq("profile_id", id).order("created_at", { ascending: false }).limit(20),
    db().from("consents").select("type, granted, created_at").eq("profile_id", id).order("created_at", { ascending: false }),
  ]);
  const sorted = (bookings ?? []).sort((a, b) => (b.class_sessions?.starts_at ?? "").localeCompare(a.class_sessions?.starts_at ?? ""));
  const attended = sorted.filter((b) => b.checked_in_at).length;
  const noShows = sorted.filter((b) => b.status === "no_show").length;
  const latest = new Map<string, boolean>();
  for (const x of consents ?? []) if (!latest.has(x.type)) latest.set(x.type, x.granted);

  return (
    <div className="space-y-6">
      <AdminTitle title={c.full_name ?? "Client"} sub={<>{c.email ?? "no email"}{c.phone ? ` · ${c.phone}` : ""}{c.deleted_at ? " · deleted" : ""}</>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Reformer" value={credits.reformer} hint="credits" />
        <Stat label="Mat" value={credits.mat} hint="credits" />
        <Stat label="Attended" value={attended} />
        <Stat label="No-shows" value={noShows} />
      </div>

      <section className="card px-5 py-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-ink-soft">Born</dt><dd className="text-ink">{c.date_of_birth ? `${dotDate(c.date_of_birth)} (${ageOn(c.date_of_birth)})` : "–"}</dd>
          <dt className="text-ink-soft">Goal</dt><dd className="text-ink">{c.goal ?? "–"}</dd>
          <dt className="text-ink-soft">Emergency</dt><dd className="text-ink">{c.emergency_contact_name ? `${c.emergency_contact_name}${c.emergency_contact_phone ? ` · ${c.emergency_contact_phone}` : ""}` : "–"}</dd>
          <dt className="text-ink-soft">Health</dt><dd className={c.parq_completed_at ? "text-ink" : "font-medium text-burgundy"}>{c.parq_completed_at ? `Answered ${dotDate(c.parq_completed_at)}` : "Not answered yet: ask before class"}</dd>
          <dt className="text-ink-soft">Photos</dt><dd className={c.photo_consent === "none" ? "font-medium text-burgundy" : "text-ink"}>{c.photo_consent ? PHOTO_CONSENT[c.photo_consent as PhotoConsent] : "Not asked yet"}</dd>
        </dl>
        {c.health_notes && (
          <div className="mt-3 rounded-2xl border border-burgundy/25 bg-burgundy-soft/60 px-3 py-1">
            <HealthInfo h={c.health_notes} label="Health info (instructor only)" open />
            {c.health_notes.clearance_needed && !c.health_notes.clearance_received_at && (
              <div className="pb-2"><ActionForm action={clearanceReceived.bind(null, id)} submit="Doctor's note received" variant="soft" /></div>
            )}
            <p className="pb-2 text-xs text-ink-soft">Consent given {dayMonth(c.health_notes.consent_at)}</p>
          </div>
        )}
      </section>

      <section className="card px-5 py-5">
        <h2 className="display mb-4 text-[0.95rem]">Details &amp; notes</h2>
        <ActionForm action={updateClient.bind(null, id)} submit="Save" variant="soft">
          <Field id="full_name" label="Name"><input id="full_name" name="full_name" defaultValue={c.full_name ?? ""} className={inputClass} /></Field>
          <Field id="email" label="Email"><input id="email" name="email" type="email" defaultValue={c.email ?? ""} className={inputClass} /></Field>
          <Field id="phone" label="Phone"><input id="phone" name="phone" type="tel" defaultValue={c.phone ?? ""} className={inputClass} /></Field>
          <Field id="admin_notes" label="Private notes" hint="Only you see these (they're included if the client requests their data)."><textarea id="admin_notes" name="admin_notes" rows={3} defaultValue={c.admin_notes ?? ""} className={`${inputClass} py-3`} /></Field>
        </ActionForm>
        <p className="mt-3 text-xs text-ink-soft">Marketing: email {latest.get("marketing_email") ? "yes" : "no"} · SMS {latest.get("marketing_sms") ? "yes" : "no"} · Policy {latest.get("policy") ? "accepted" : "not yet"}</p>
      </section>

      <section className="card px-5 py-5">
        <h2 className="display mb-3 text-[0.95rem]">Membership</h2>
        {membership ? (
          <div className="space-y-3 text-sm">
            <p className="text-ink"><strong className="font-medium">{membership.products?.name}</strong> · {membership.status} · {membership.provider === "stripe" ? "auto-renews" : "pays at studio"}</p>
            <p className="text-ink-soft">Period {dayMonth(membership.current_period_start)}–{dayMonth(membership.current_period_end)}{membership.cancel_at_period_end ? " · stops at period end" : ""}{membership.next ? ` · changes to ${membership.next.name}` : ""}</p>
            <MembershipControls id={membership.id} status={membership.status} cancelAtEnd={membership.cancel_at_period_end} />
            {membership.provider === "offline" && <div className="flex items-center justify-between gap-2 rounded-2xl bg-lilac-50 px-3 py-2"><span className="text-ink">Record renewal payment</span><RenewButtons membershipId={membership.id} name={c.full_name ?? "client"} /></div>}
            <ActionForm action={changeMembershipProduct.bind(null, membership.id)} submit="Change from next period" variant="ghost" className="flex items-end gap-2 [&>button]:w-auto">
              <Field id="product_id" label="Change package"><select id="product_id" name="product_id" className={inputClass} defaultValue={membership.next_product_id ?? membership.product_id}>{(monthly ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            </ActionForm>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">No monthly package. When they pay at the studio for one, mark their request as paid on Today.</p>
        )}
        {(payments ?? []).filter((p) => p.status === "pending").map((p) => (
          <div key={p.id} className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
            <span className="text-ink">{p.description} · {eur(p.amount_cents)}<span className="block text-xs text-ink-soft">awaiting payment</span></span>
            <MarkPaid paymentId={p.id} label={p.description} />
          </div>
        ))}
      </section>

      <section className="card grid gap-5 px-5 py-5 sm:grid-cols-2">
        <div>
          <h2 className="display mb-1 text-[0.95rem]">Student</h2>
          <p className="mb-3 text-sm text-ink-soft">After seeing their student card in person. No photos are stored.{c.student_verified_until && c.student_verified_until >= todayKey() ? ` Student price active until ${c.student_verified_until}.` : ""}</p>
          <ActionForm action={setStudent.bind(null, id)} submit="Save" variant="ghost">
            <Field id="student_verified_until" label="Verified until" hint="Leave empty to remove"><input id="student_verified_until" name="student_verified_until" type="date" defaultValue={c.student_verified_until ?? ""} className={inputClass} /></Field>
          </ActionForm>
        </div>
        <div>
          <h2 className="display mb-1 text-[0.95rem]">Missed class: public holiday</h2>
          <p className="mb-3 text-sm text-ink-soft">Gives one class back (valid 30 days) so they can reschedule.</p>
          <ActionForm action={holidayReturn.bind(null, id)} submit="Return a class" variant="ghost">
            <div className="grid grid-cols-2 gap-2">
              <Field id="h-kind" label="Type"><select id="h-kind" name="kind" className={inputClass}><option value="reformer">Reformer</option><option value="mat">Mat</option></select></Field>
              <Field id="h-date" label="Holiday"><input id="h-date" name="date" type="date" className={inputClass} /></Field>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className="card px-5 py-5">
        <h2 className="display mb-4 text-[0.95rem]">Adjust classes</h2>
        <ActionForm action={adjustCredits.bind(null, id)} submit="Save adjustment" variant="soft" className="grid grid-cols-2 gap-3">
          <Field id="kind" label="Type"><select id="kind" name="kind" className={inputClass}><option value="reformer">Reformer</option><option value="mat">Mat</option></select></Field>
          <Field id="amount" label="Classes (+/−)" hint="e.g. 2 or -1"><input id="amount" name="amount" type="number" min={-50} max={50} defaultValue={1} className={inputClass} /></Field>
          <Field id="days" label="Valid (days, if adding)"><input id="days" name="days" type="number" min={0} defaultValue={60} className={inputClass} /></Field>
          <Field id="reason" label="Reason (required)"><input id="reason" name="reason" required placeholder="Goodwill after cancelled class" className={inputClass} /></Field>
        </ActionForm>
        {(lots ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {lots!.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 py-2">
                <span>{l.note ?? l.credit_kind} <span className="text-ink-soft">({l.credit_kind})</span></span>
                <span className="text-ink-soft">{l.remaining}/{l.total}{l.expires_at ? ` · exp. ${dayMonth(l.expires_at)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="display border-b border-line px-4 py-3 text-[0.95rem]">Class ledger</h2>
        <ul className="divide-y divide-line text-sm">
          {(ledger ?? []).map((e) => (
            <li key={e.id} className="flex justify-between gap-3 px-4 py-2">
              <span className="text-ink">{e.entry_type.replace("_", " ")} · {e.credit_kind}{e.note ? <span className="text-ink-soft"> · {e.note}</span> : null}<span className="block text-xs text-ink-soft">{dayMonth(e.created_at)}</span></span>
              <span className={e.delta > 0 ? "font-medium text-plum-700" : "text-ink-soft"}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
            </li>
          ))}
          {(ledger ?? []).length === 0 && <li className="px-4 py-3 text-ink-soft">No entries.</li>}
        </ul>
      </section>

      <section className="card overflow-hidden">
        <h2 className="display border-b border-line px-4 py-3 text-[0.95rem]">History</h2>
        <ul className="divide-y divide-line text-sm">
          {sorted.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/classes/${b.class_sessions?.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-lilac-50">
                <span>{b.class_sessions?.title ?? b.class_sessions?.class_types?.name}<span className="block text-xs text-ink-soft">{b.class_sessions && `${longDate(b.class_sessions.starts_at)} · ${time(b.class_sessions.starts_at)}`}</span></span>
                <Badge tone={b.status === "confirmed" ? (b.checked_in_at ? "mauve" : "lilac") : "plain"}>{b.checked_in_at ? "Attended" : b.status.replace("_", " ")}</Badge>
              </Link>
            </li>
          ))}
          {sorted.length === 0 && <li className="px-4 py-4 text-ink-soft">No bookings yet.</li>}
        </ul>
      </section>

      {(payments ?? []).length > 0 && (
        <section className="card px-4 py-3">
          <h2 className="display mb-2 text-[0.95rem]">Payments</h2>
          <ul className="divide-y divide-line text-sm">
            {payments!.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.description}</span><span className="text-ink-soft">{eur(p.amount_cents)} · {p.status}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
