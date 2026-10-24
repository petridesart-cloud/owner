import Link from "next/link";
import { notFound } from "next/navigation";
import { Cake, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { dayMonth, dotDate, lastDay, longDate, nowMs, time, todayKey } from "@/lib/time";
import { HealthInfo } from "../../HealthInfo";
import { PHOTO_CONSENT, type PhotoConsent } from "@/lib/photo-consent";
import { ageOn } from "@/lib/profile";
import { eur } from "@/lib/money";
import { STATUS_LABEL, clientHistory, tally, type Group } from "@/lib/client-history";
import { adjustLot, changeMembershipProduct, clearanceReceived, giveClasses, sendBirthday, setStudent, updateClient } from "../../actions";
import { MarkPaid, MembershipControls, RenewButtons } from "../../PaymentButtons";
import { AdminTitle } from "../../ui";
import { AdjustPackage } from "./AdjustPackage";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { cash: "cash", revolut: "Revolut", bank_transfer: "bank transfer", card_in_person: "card", online: "online", card: "card" };

/** A collapsed section, to keep the page short. */
function Drop({ title, sub, children, open = false }: { title: string; sub?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="card group overflow-hidden" open={open}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span><span className="display block text-[0.95rem] text-ink">{title}</span>{sub && <span className="text-xs text-ink-soft">{sub}</span>}</span>
        <ChevronDown aria-hidden size={18} className="shrink-0 text-ink-soft transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

/** Reformer on top, mat underneath. */
function TwoLine({ label, reformer, mat }: { label: string; reformer: number; mat: number }) {
  return (
    <div className="card px-3.5 py-3">
      <p className="eyebrow">{label}</p>
      <dl className="mt-1.5 space-y-0.5 text-sm">
        <div className="flex items-baseline justify-between gap-2"><dt className="text-ink-soft">Reformer</dt><dd className="font-serif text-2xl leading-none text-ink">{reformer}</dd></div>
        <div className="flex items-baseline justify-between gap-2"><dt className="text-ink-soft">Mat</dt><dd className="font-serif text-2xl leading-none text-ink">{mat}</dd></div>
      </dl>
    </div>
  );
}

const paidLine = (g: Group) => g.key.startsWith("manual-") ? "Settled outside the app" : g.paidCents != null ? `${eur(g.paidCents)}${g.paidAt ? ` paid ${dotDate(g.paidAt)}` : ""}${g.method ? ` · ${METHOD[g.method] ?? g.method}` : ""}` : "Not paid in the app";
const period = (g: Group) => g.total == null ? "" : g.startsAt
  ? `${dotDate(g.startsAt)} – ${g.endsAt ? dotDate(lastDay(g.endsAt)) : "…"}`
  : "Starts with the first class";

function Summary({ g }: { g: Group }) {
  const t = tally(g.classes);
  const bits = [`Attended ${t.attended}`, `Missed ${t.missed}`, t.cancelled ? `Cancelled ${t.cancelled}` : "", t.upcoming ? `Booked ${t.upcoming}` : "", t.unmarked ? `Not marked ${t.unmarked}` : ""].filter(Boolean);
  return <p className="text-sm text-ink">{bits.join(" · ")}</p>;
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: c } = await db().from("profiles").select("*, health_notes(note, injuries, medication, parq_yes, conditions, details, pregnancy, pregnancy_weeks, postpartum_months, bp_meds, clearance_needed, clearance_received_at, consent_at)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ groups, totals }, { data: membership }, { data: monthly }, { data: ledger }, { data: payments }, { data: history }] = await Promise.all([
    clientHistory(id),
    db().from("memberships").select("*, products!memberships_product_id_fkey(name, credits, price_cents), next:products!memberships_next_product_id_fkey(name)").eq("profile_id", id).in("status", ["active", "paused", "past_due"]).maybeSingle(),
    db().from("products").select("id, name").eq("kind", "membership").eq("active", true).order("sort_order"),
    db().from("credit_ledger").select("id, delta, entry_type, credit_kind, note, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(60),
    db().from("payments").select("id, description, amount_cents, status, method, intended_method, paid_at, created_at").eq("profile_id", id).order("created_at", { ascending: false }).limit(40),
    db().from("health_history").select("*").eq("profile_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const current = groups.filter((g) => g.current);
  const lots = groups.filter((g) => g.total != null && (g.current || (g.endsAt ?? "") > new Date(nowMs() - 60 * 86_400_000).toISOString()));
  const birthday = !!c.date_of_birth && c.date_of_birth.slice(5) === todayKey().slice(5);
  const first = c.first_name ?? c.full_name?.split(" ")[0] ?? "";
  const pending = (payments ?? []).filter((p) => p.status === "pending");
  const [latestHealth, ...olderHealth] = history ?? [];

  return (
    <div className="space-y-5">
      <AdminTitle back="/admin/clients" title={c.full_name ?? "Client"}
        sub={<>{c.phone ?? "no phone"}<br />{c.email ?? "no email"}{c.deleted_at ? " · deleted" : ""}</>}
        action={birthday ? <Cake aria-label="Birthday today" size={26} className="text-plum-700" /> : undefined} />

      {birthday && (
        <section className="card border-plum-700/20 bg-lilac-50 px-5 py-4">
          <h2 className="display mb-1 flex items-center gap-2 text-[0.95rem]"><Cake aria-hidden size={18} className="text-plum-700" />It&apos;s {first}&apos;s birthday</h2>
          <p className="mb-3 text-sm text-ink-soft">Send them a birthday email. Change the words as you like.</p>
          <ActionForm action={sendBirthday.bind(null, id)} submit="Send birthday email" variant="soft">
            <label htmlFor="message" className="sr-only">Message</label>
            <textarea id="message" name="message" rows={4} className={`${inputClass} py-3`}
              defaultValue={`Happy birthday, ${first}! Wishing you a beautiful year ahead, full of strength and calm. See you on the reformer.\n\nElysia, Re·Form Pilates`} />
          </ActionForm>
        </section>
      )}

      <div className="grid grid-cols-3 gap-2">
        <TwoLine label="Packages" {...totals.packages} />
        <TwoLine label="Attended" {...totals.attended} />
        <TwoLine label="No-shows" {...totals.noShows} />
      </div>
      <p className="-mt-3 text-xs text-ink-soft">No-shows: booked and didn&apos;t come, or cancelled less than the cutoff before (the class was used).</p>

      <section className="card px-5 py-4">
        <h2 className="display mb-3 text-[0.95rem]">Current package</h2>
        {current.length ? (
          <ul className="space-y-4">
            {current.map((g) => {
              const t = tally(g.classes);
              return (
                <li key={g.key} className="rounded-2xl border border-line bg-paper/60 px-4 py-3">
                  <p className="font-medium text-ink">{g.title}</p>
                  <p className="text-sm text-ink-soft">{paidLine(g)}</p>
                  {g.total != null && <p className="text-sm text-ink-soft">{period(g)}</p>}
                  {g.total != null ? (
                    <>
                      <p className="mt-2 text-sm text-ink"><span className="font-serif text-2xl">{g.total - (g.remaining ?? 0)}</span> of {g.total} used · {g.remaining} left</p>
                      <p className="text-sm text-ink">Attended {t.attended} · Missed {t.missed}{t.upcoming ? ` · Booked ${t.upcoming}` : ""}{t.unmarked ? ` · Not marked ${t.unmarked}` : ""}</p>
                    </>
                  ) : g.classes.length > 1 ? (
                    <p className="mt-1 text-sm text-ink">{t.upcoming} coming up{(() => { const n = g.classes.find((x) => x.status === "upcoming"); return n ? ` · next ${longDate(n.startsAt)}, ${time(n.startsAt)}` : ""; })()}</p>
                  ) : g.classes[0] && <p className="mt-1 text-sm text-ink">{longDate(g.classes[0].startsAt)} · {time(g.classes[0].startsAt)}</p>}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-ink-soft">No current package.</p>}
        {pending.map((p) => (
          <div key={p.id} className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
            <span className="text-ink">{p.description} · {eur(p.amount_cents)}<span className="block text-xs text-ink-soft">awaiting payment{p.intended_method ? ` · ${METHOD[p.intended_method] ?? p.intended_method}` : ""}</span></span>
            <MarkPaid paymentId={p.id} label={p.description} />
          </div>
        ))}
      </section>

      <section className="card px-5 py-4">
        <h2 className="display mb-3 text-[0.95rem]">Details &amp; notes</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-ink-soft">Birthday</dt><dd className="text-ink">{c.date_of_birth ? `${dotDate(c.date_of_birth)} (${ageOn(c.date_of_birth)})` : "–"}</dd>
          <dt className="text-ink-soft">Emergency</dt><dd className="text-ink">{c.emergency_contact_name ? [c.emergency_contact_name, c.emergency_contact_relation, c.emergency_contact_phone].filter(Boolean).join(" · ") : "–"}</dd>
          <dt className="text-ink-soft">Photos</dt><dd className={c.photo_consent === "none" ? "font-medium text-burgundy" : "text-ink"}>{c.photo_consent ? PHOTO_CONSENT[c.photo_consent as PhotoConsent] : "Not asked yet"}</dd>
          <dt className="text-ink-soft">Goal</dt><dd className="text-ink">{c.goal ?? "–"}</dd>
        </dl>
        <details className="mt-3 rounded-2xl border border-line px-4 py-1">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ink">Edit name, phone or email</summary>
          <div className="pb-3 pt-1">
            <ActionForm action={updateClient.bind(null, id)} submit="Save" variant="soft">
              <Field id="full_name" label="Name"><input id="full_name" name="full_name" defaultValue={c.full_name ?? ""} className={inputClass} /></Field>
              <Field id="phone" label="Phone"><input id="phone" name="phone" type="tel" defaultValue={c.phone ?? ""} className={inputClass} /></Field>
              <Field id="email" label="Email"><input id="email" name="email" type="email" defaultValue={c.email ?? ""} className={inputClass} /></Field>
            </ActionForm>
          </div>
        </details>
        <div className="mt-4">
          <ActionForm action={updateClient.bind(null, id)} submit="Save notes" variant="soft">
            <Field id="admin_notes" label="Your notes" hint="Only you see these (they're included if the client asks for their data)."><textarea id="admin_notes" name="admin_notes" rows={3} defaultValue={c.admin_notes ?? ""} className={`${inputClass} py-3`} /></Field>
          </ActionForm>
        </div>
      </section>

      <section className="card px-5 py-4">
        <h2 className="display mb-1 text-[0.95rem]">Health</h2>
        <p className={`text-sm ${c.parq_completed_at ? "text-ink-soft" : "font-medium text-burgundy"}`}>{c.parq_completed_at ? `Last answered ${dotDate(c.parq_completed_at)}` : "Not answered yet: ask before class"}</p>
        {latestHealth ? (
          <>
            <HealthEntry h={latestHealth} received={c.health_notes?.clearance_received_at ?? null} />
            {olderHealth.length > 0 && (
              <details className="mt-2 rounded-2xl border border-line px-4 py-1">
                <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-ink">Earlier answers ({olderHealth.length})</summary>
                <div className="divide-y divide-line pb-2">{olderHealth.map((h) => <HealthEntry key={h.id} h={h} received={null} />)}</div>
              </details>
            )}
          </>
        ) : c.health_notes ? <HealthInfo h={c.health_notes} label="Answers" open />
          : c.parq_completed_at && <p className="mt-2 text-sm text-ink">No injuries or medical conditions.</p>}
        {c.health_notes?.clearance_needed && !c.health_notes.clearance_received_at && (
          <div className="mt-3"><ActionForm action={clearanceReceived.bind(null, id)} submit="Doctor's note received" variant="soft" /></div>
        )}
        {c.health_notes?.consent_at && <p className="mt-2 text-xs text-ink-soft">Health consent given {dayMonth(c.health_notes.consent_at)} · only you can see this</p>}
      </section>

      <section className="card px-5 py-4">
        <h2 className="display mb-1 text-[0.95rem]">Student</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Leave empty if they&apos;re not a student. After seeing their student card in person, set the date it&apos;s valid until: they then get {10}% off group packages automatically until that date. No photos are stored.
          {c.student_verified_until && c.student_verified_until >= todayKey() ? <strong className="mt-1 block font-medium text-ink">Student price active until {dotDate(c.student_verified_until)}.</strong> : null}
        </p>
        <ActionForm action={setStudent.bind(null, id)} submit="Save" variant="ghost">
          <Field id="student_verified_until" label="Student until"><input id="student_verified_until" name="student_verified_until" type="date" defaultValue={c.student_verified_until ?? ""} className={inputClass} /></Field>
        </ActionForm>
      </section>

      <section className="card px-5 py-4">
        <h2 className="display mb-3 text-[0.95rem]">Adjust package</h2>
        <AdjustPackage
          lots={lots.map((g) => ({ id: g.key, label: `${g.title} · ${g.remaining}/${g.total} left${g.endsAt ? ` · ends ${dotDate(lastDay(g.endsAt))}` : ""}` }))}
          adjustLot={adjustLot.bind(null, id)} giveClasses={giveClasses.bind(null, id)} />
      </section>

      {membership && (
        <section className="card px-5 py-5">
          <h2 className="display mb-3 text-[0.95rem]">Membership</h2>
          <div className="space-y-3 text-sm">
            <p className="text-ink"><strong className="font-medium">{membership.products?.name}</strong> · {membership.status} · {membership.provider === "stripe" ? "auto-renews" : "pays at studio"}</p>
            <p className="text-ink-soft">Period {dayMonth(membership.current_period_start)}–{dayMonth(membership.current_period_end)}{membership.cancel_at_period_end ? " · stops at period end" : ""}{membership.next ? ` · changes to ${membership.next.name}` : ""}</p>
            <MembershipControls id={membership.id} status={membership.status} cancelAtEnd={membership.cancel_at_period_end} />
            {membership.provider === "offline" && <div className="flex items-center justify-between gap-2 rounded-2xl bg-lilac-50 px-3 py-2"><span className="text-ink">Record renewal payment</span><RenewButtons membershipId={membership.id} name={c.full_name ?? "client"} /></div>}
            <ActionForm action={changeMembershipProduct.bind(null, membership.id)} submit="Change from next period" variant="ghost" className="flex items-end gap-2 [&>button]:w-auto">
              <Field id="product_id" label="Change package"><select id="product_id" name="product_id" className={inputClass} defaultValue={membership.next_product_id ?? membership.product_id}>{(monthly ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            </ActionForm>
          </div>
        </section>
      )}

      <Drop title="History" sub={`${groups.length} package${groups.length === 1 ? "" : "s"}, trials and drop-ins`}>
        <ul className="divide-y divide-line">
          {groups.map((g) => (
            <li key={g.key}>
              <details className="group/h">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-2.5 hover:bg-lilac-50 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{g.title}</span>
                    <span className="block text-xs text-ink-soft">{g.total != null ? period(g) : g.classes[0] ? dotDate(g.classes[0].startsAt) : ""}{g.current ? " · current" : ""}</span>
                  </span>
                  <ChevronDown aria-hidden size={16} className="shrink-0 text-ink-soft transition group-open/h:rotate-180" />
                </summary>
                <div className="space-y-2 bg-paper/60 px-5 pb-4 pt-1">
                  <p className="text-xs text-ink-soft">{paidLine(g)}{g.total != null ? ` · ${g.total} classes · ${period(g)}` : ""}</p>
                  <Summary g={g} />
                  <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
                    {g.classes.map((r) => (
                      <li key={r.bookingId}>
                        <Link href={r.sessionId ? `/admin/classes/${r.sessionId}` : "#"} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-lilac-50">
                          <span>{dotDate(r.startsAt)} · {time(r.startsAt)}<span className="block text-xs text-ink-soft">{r.name}</span></span>
                          <span className={`text-right text-xs ${r.status === "no_show" || r.status === "late_cancel" ? "font-medium text-burgundy" : r.status === "attended" ? "font-medium text-plum-700" : "text-ink-soft"}`}>{STATUS_LABEL[r.status]}</span>
                        </Link>
                      </li>
                    ))}
                    {g.classes.length === 0 && <li className="px-3 py-2 text-ink-soft">No classes booked yet.</li>}
                  </ul>
                </div>
              </details>
            </li>
          ))}
          {groups.length === 0 && <li className="px-5 py-4 text-sm text-ink-soft">Nothing yet.</li>}
        </ul>
      </Drop>

      <Drop title="Payments" sub={`${(payments ?? []).filter((p) => p.status === "paid").length} paid`}>
        <ul className="divide-y divide-line text-sm">
          {(payments ?? []).map((p) => (
            <li key={p.id} className="flex justify-between gap-3 px-5 py-2.5">
              <span className="text-ink">{p.description}<span className="block text-xs text-ink-soft">{dotDate(p.paid_at ?? p.created_at)}{p.method ? ` · ${METHOD[p.method] ?? p.method}` : ""}</span></span>
              <span className="text-right text-ink-soft">{eur(p.amount_cents)}<span className="block text-xs">{p.status === "pending" ? "awaiting payment" : p.status}</span></span>
            </li>
          ))}
          {(payments ?? []).length === 0 && <li className="px-5 py-4 text-ink-soft">No payments.</li>}
        </ul>
      </Drop>

      <Drop title="Class ledger" sub="Every class added, used, returned or adjusted">
        <ul className="divide-y divide-line text-sm">
          {(ledger ?? []).map((e) => (
            <li key={e.id} className="flex justify-between gap-3 px-5 py-2">
              <span className="text-ink">{e.entry_type.replace(/_/g, " ")} · {e.credit_kind}{e.note ? <span className="text-ink-soft"> · {e.note}</span> : null}<span className="block text-xs text-ink-soft">{dotDate(e.created_at)}</span></span>
              <span className={e.delta > 0 ? "font-medium text-plum-700" : "text-ink-soft"}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
            </li>
          ))}
          {(ledger ?? []).length === 0 && <li className="px-5 py-3 text-ink-soft">No entries.</li>}
        </ul>
      </Drop>
    </div>
  );
}

type HH = { id: string; created_at: string; conditions: string[]; details: string | null; pregnancy: string | null; pregnancy_weeks: number | null; postpartum_months: number | null; bp_meds: boolean | null; medication: string | null; clearance_needed: boolean };

/** One saved version of their health answers. Facts only. */
function HealthEntry({ h, received }: { h: HH; received: string | null }) {
  const none = !h.conditions.length && !h.details && !h.pregnancy && !h.bp_meds && !h.medication;
  return (
    <div className="py-2">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">{dotDate(h.created_at)}</p>
      {none ? <p className="text-sm text-ink">No injuries or medical conditions.</p> : (
        <HealthInfo open label="Answers" h={{ ...h, clearance_received_at: received }} />
      )}
    </div>
  );
}
