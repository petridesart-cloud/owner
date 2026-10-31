import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Checkbox, Field, inputClass } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { addPackage, paymentsUnlocked, resetDemoData, saveClassType, saveProduct, saveSettings } from "../actions";
import { env, smsLive } from "@/lib/env";
import { AdminTitle } from "../ui";
import { Readiness } from "../Readiness";
import { isPlaceholder, launchReadiness } from "@/lib/business";

export const dynamic = "force-dynamic";

/** A collapsible group of settings (inputs inside still save with the form when closed). */
function Group({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span><span className="block font-medium text-ink">{title}</span><span className="text-xs text-ink-soft">{sub}</span></span>
        <ChevronDown aria-hidden size={18} className="shrink-0 text-ink-soft transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

export default async function SettingsPage() {
  const [s, { data: types }, { data: products }, unlocked, readiness] = await Promise.all([
    getSettings(),
    db().from("class_types").select("*").order("sort_order"),
    db().from("products").select("*").or("active.eq.true,kind.neq.membership").order("sort_order"),
    paymentsUnlocked(),
    getSettings().then(launchReadiness),
  ]);
  const n = (id: string, label: string, value: number, hint?: string, step = 1) => (
    <Field id={id} label={label} hint={hint}><input id={id} name={id} type="number" step={step} min={0} defaultValue={value} className={inputClass} /></Field>
  );
  const t = (id: string, label: string, value: string, hint?: string) => (
    <Field id={id} label={label} hint={hint}>
      <input id={id} name={id} defaultValue={isPlaceholder(value) ? "" : value} placeholder={isPlaceholder(value) ? value.replace(/[[\]]/g, "") : undefined} className={inputClass} />
    </Field>
  );

  return (
    <div className="space-y-6">
      <AdminTitle title="Settings" sub="Times are in Europe/Nicosia; prices in EUR." />

      <Readiness items={readiness} />

      <nav aria-label="More tools" className="grid grid-cols-2 gap-2">
        {[
          ["/admin/photos", "Photos", "Logo, studio, events"],
          ["/admin/texts", "Your texts", "Rules, policy, about you"],
          ["/admin/team", "Studio team", "Who can open this admin"],
          ["/admin/outbox", "Messages", "Emails & texts sent"],
          ["/admin/import", "Import", "Clients from a spreadsheet"],
          ["/admin/compliance", "Launch checklist", "Before going live"],
        ].map(([href, label, sub]) => (
          <Link key={href} href={href} className="card flex min-h-14 flex-col justify-center px-4 py-2"><span className="font-medium text-ink">{label}</span><span className="text-xs text-ink-soft">{sub}</span></Link>
        ))}
      </nav>

      {env.demoMode && (
        <section className="card border-mauve/50 bg-mauve-soft/50 px-5 py-5">
          <h2 className="display mb-1 text-[0.95rem]">Demo data</h2>
          <p className="mb-4 text-sm text-ink-soft">Wipe all clients, bookings, payments and messages and rebuild fresh demo data. Your settings, prices, photos, class types and admin login are kept. Only available while DEMO_MODE is on.</p>
          <ActionForm action={resetDemoData} submit="Reset demo data" variant="ghost" confirm="Reset all demo clients and bookings?" />
        </section>
      )}

      <section className="card px-5 py-5">
        <h2 className="display mb-1 text-[0.95rem]">Settings</h2>
        <p className="mb-4 text-sm text-ink-soft">Tap a section to open it. One Save button saves them all.</p>
        <ActionForm action={saveSettings} submit="Save settings">
          <Group title="Your studio" sub="Name, address, contact">
          <div className="grid grid-cols-2 gap-3">
            {t("legal_name", "Studio name", s.legal_name)}
            {t("trader_name", "Your full name", s.trader_name, "Shown in the footer (EU law).")}
          </div>
          {t("address", "Studio address", s.address)}
          <div className="grid grid-cols-2 gap-3">
            {t("contact_email", "Email", s.contact_email)}
            {t("contact_phone", "Phone", s.contact_phone)}
          </div>
          {t("instagram_handle", "Instagram", s.instagram_handle)}
          </Group>

          <Group title="How clients pay you" sub="Revolut, bank, student discount">
          {t("revolut_link", "Revolut link", s.revolut_link, "e.g. https://revolut.me/yourname")}
          <div className="grid grid-cols-2 gap-3">
            {t("bank_account_name", "Name on bank account", s.bank_account_name)}
            {t("bank_iban", "IBAN", s.bank_iban)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {n("student_discount_pct", "Student discount (%)", s.student_discount_pct, "Group packages only")}
            {n("unpaid_request_expiry_hours", "Unpaid requests expire (hours)", s.unpaid_request_expiry_hours)}
          </div>

          </Group>

          <Group title="Booking rules" sub="Booking window, cancellations, waitlist">
          <div className="grid grid-cols-2 gap-3">
            {n("booking_window_weeks", "Clients can book (weeks ahead)", Math.round(s.booking_window_days / 7))}
            {n("cancellation_cutoff_hours", "Free cancellation until (hours before)", s.cancellation_cutoff_hours)}
            {n("expiry_reminder_days", "Remind before package expires (days)", s.expiry_reminder_days)}
            {n("waitlist_close_minutes", "Waitlist stops (minutes before class)", s.waitlist_close_minutes, "Nobody is moved in after this. Yours: 60")}
          </div>
          <Checkbox id="waitlist_sms" name="waitlist_sms" defaultChecked={s.waitlist_sms}>
            Also text people when a waitlist spot is theirs {smsLive() ? "" : "(starts once an SMS account is connected)"}
          </Checkbox>

          </Group>

          <Group title="Message on every page" sub="A banner for news, e.g. a closed week">
          {t("status_banner", "Status banner (optional)", s.status_banner, "e.g. “Studio closed this week, see you Monday!” Leave empty to hide.")}
          </Group>

          <Group title="Advanced" sub="Technical options">
              <div className="grid grid-cols-2 gap-3">
                {n("waitlist_window_hours", "Waitlist claim window (hours)", s.waitlist_window_minutes / 60, undefined, 0.25)}
                {t("reminder_offsets", "Class reminders (hours before)", s.reminder_offsets_minutes.map((m) => m / 60).join(", "), "e.g. 24, 2")}
                {n("hold_minutes", "Online payment hold (minutes)", s.hold_minutes)}
                {t("policy_version", "Policy version", s.policy_version, "Change when the policy text changes")}
              </div>
              <Checkbox id="refund_late_cancel_if_filled" name="refund_late_cancel_if_filled" defaultChecked={s.refund_late_cancel_if_filled}>
                Return the class for a late cancellation if someone else takes the spot
              </Checkbox>
              <Checkbox id="allow_pay_later" name="allow_pay_later" defaultChecked={s.allow_pay_later}>Allow booking one class before paying (your policy: off)</Checkbox>
              <Checkbox id="online_payments_enabled" name="online_payments_enabled" defaultChecked={s.online_payments_enabled} disabled={!unlocked}>
                Online card payments (Stripe){env.demoMode ? ", test mode in this demo" : ""}
              </Checkbox>
              {!unlocked && <p className="-mt-2 pl-8 text-xs text-ink-soft">Locked until the Launch checklist&apos;s “Before online payments” items are ticked.</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field id="membership_period_mode" label="Monthly package period (future)">
                  <select id="membership_period_mode" name="membership_period_mode" defaultValue={s.membership_period_mode} className={inputClass}>
                    <option value="rolling">Rolling 30 days</option><option value="calendar">Calendar month</option>
                  </select>
                </Field>
                {n("rollover_max", "Classes rolling over (future)", s.rollover_max, "0 = none")}
              </div>
          </Group>
        </ActionForm>
      </section>

      <section>
        <h2 className="display mb-1 text-[0.95rem]">Class types</h2>
        <p className="mb-3 text-sm text-ink-soft">
          What clients see on the schedule and what you choose in the timetable, e.g. Reformer, Mat or a new &ldquo;Pre-natal&rdquo; class.
          Each type says which package pays for it. Prices aren&apos;t set here: they come from your packages, trials and drop-ins. Events set their own price, spots and time.
        </p>
        <div className="space-y-3">
          {[...(types ?? []), null].map((ct) => {
            const isEvent = ct?.kind === "event";
            return (
              <details key={ct?.id ?? "new"} className="card px-5 py-3">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between font-medium text-ink">
                  {ct ? ct.name : "+ Add a class type"}
                  {ct && <span className="text-sm font-normal text-ink-soft">{isEvent ? "events" : `${ct.default_capacity} spots · ${ct.default_duration_minutes} min · ${ct.kind === "mat" ? "Mat" : "Reformer"} package`}{ct.active ? "" : " · hidden"}</span>}
                </summary>
                <div className="pb-3 pt-3">
                  <ActionForm action={saveClassType.bind(null, ct?.id ?? null)} submit={ct ? "Save" : "Add class type"} variant="soft">
                    <Field id={`name-${ct?.id}`} label="Name"><input id={`name-${ct?.id}`} name="name" defaultValue={ct?.name ?? ""} placeholder="e.g. Pre-natal" className={inputClass} /></Field>
                    {isEvent ? (
                      <input type="hidden" name="kind" value="event" />
                    ) : (
                      <Field id={`kind-${ct?.id}`} label="Paid with" hint="Which package's classes are used to book it. Trials and drop-ins follow the same type.">
                        <select id={`kind-${ct?.id}`} name="kind" defaultValue={ct?.kind ?? "reformer"} className={inputClass}><option value="reformer">Reformer package</option><option value="mat">Mat package</option></select>
                      </Field>
                    )}
                    {!isEvent && (
                      <div className="grid grid-cols-3 gap-3">
                        <Field id={`cap-${ct?.id}`} label="Spots"><input id={`cap-${ct?.id}`} name="default_capacity" type="number" min={1} max={100} defaultValue={ct?.default_capacity ?? 3} className={inputClass} /></Field>
                        <Field id={`dur-${ct?.id}`} label="Minutes"><input id={`dur-${ct?.id}`} name="default_duration_minutes" type="number" min={10} defaultValue={ct?.default_duration_minutes ?? 50} className={inputClass} /></Field>
                        <Field id={`cost-${ct?.id}`} label="Classes used" hint="e.g. 2 for a private"><input id={`cost-${ct?.id}`} name="credit_cost" type="number" min={1} max={10} defaultValue={ct?.credit_cost ?? 1} className={inputClass} /></Field>
                      </div>
                    )}
                    <Field id={`loc-${ct?.id}`} label="Default location"><input id={`loc-${ct?.id}`} name="default_location" defaultValue={ct?.default_location ?? ""} className={inputClass} /></Field>
                    <Field id={`desc-${ct?.id}`} label="Description"><textarea id={`desc-${ct?.id}`} name="description" rows={2} defaultValue={ct?.description ?? ""} className={`${inputClass} py-3`} /></Field>
                    <Checkbox id={`active-${ct?.id}`} name="active" defaultChecked={ct?.active ?? true}>Active</Checkbox>
                  </ActionForm>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="display mb-1 text-[0.95rem]">Packages</h2>
        <p className="mb-3 text-sm text-ink-soft">Your packages, trials and drop-ins. Change a price or details and clients see it straight away.</p>
        <div className="space-y-3">
          {(products ?? []).filter((p) => p.kind !== "membership").map((p) => (
            <details key={p.id} className="card px-5 py-3">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between font-medium text-ink">{p.name}<span className="text-sm font-normal text-ink-soft">€{(p.price_cents / 100).toFixed(2)}{p.active ? "" : " · hidden"}</span></summary>
              <div className="pb-3 pt-3">
                <ActionForm action={saveProduct.bind(null, p.id)} submit="Save" variant="soft">
                  {p.tag === "package" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field id={`pc-${p.id}`} label="Classes"><input id={`pc-${p.id}`} name="credits" type="number" min={1} defaultValue={p.credits} className={inputClass} /></Field>
                      <Field id={`pm-${p.id}`} label="Months"><input id={`pm-${p.id}`} name="months" type="number" min={1} max={12} defaultValue={p.months ?? 1} className={inputClass} /></Field>
                      <Field id={`pv-${p.id}`} label="Valid (days)" hint="From the first class"><input id={`pv-${p.id}`} name="validity_days" type="number" min={1} defaultValue={p.validity_days ?? ""} className={inputClass} /></Field>
                      <Field id={`pp-${p.id}`} label="Price €"><input id={`pp-${p.id}`} name="price" inputMode="decimal" defaultValue={(p.price_cents / 100).toFixed(2)} className={inputClass} /></Field>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field id={`pn-${p.id}`} label="Name"><input id={`pn-${p.id}`} name="name" defaultValue={p.name} className={inputClass} /></Field>
                      <Field id={`pp-${p.id}`} label="Price €"><input id={`pp-${p.id}`} name="price" inputMode="decimal" defaultValue={(p.price_cents / 100).toFixed(2)} className={inputClass} /></Field>
                    </div>
                  )}
                  <Field id={`pdesc-${p.id}`} label="Short description (optional)"><input id={`pdesc-${p.id}`} name="description" defaultValue={p.description ?? ""} className={inputClass} /></Field>
                  <Checkbox id={`pa-${p.id}`} name="active" defaultChecked={p.active}>On sale</Checkbox>
                </ActionForm>
              </div>
            </details>
          ))}
          <details className="card px-5 py-3">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink">+ Add a package</summary>
            <div className="pb-3 pt-3">
              <ActionForm action={addPackage} submit="Add package" variant="soft">
                <Field id="np-kind" label="For"><select id="np-kind" name="credit_kind" className={inputClass}><option value="reformer">Reformer classes</option><option value="mat">Mat classes</option></select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="np-credits" label="Classes"><input id="np-credits" name="credits" type="number" min={1} defaultValue={10} className={inputClass} /></Field>
                  <Field id="np-months" label="Months"><input id="np-months" name="months" type="number" min={1} max={12} defaultValue={1} className={inputClass} /></Field>
                  <Field id="np-valid" label="Valid (days)" hint="From the first class"><input id="np-valid" name="validity_days" type="number" min={1} defaultValue={30} className={inputClass} /></Field>
                  <Field id="np-price" label="Price €"><input id="np-price" name="price" inputMode="decimal" placeholder="e.g. 150" className={inputClass} /></Field>
                </div>
              </ActionForm>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
