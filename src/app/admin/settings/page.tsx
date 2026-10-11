import { ActionForm } from "@/components/ActionForm";
import { Checkbox, Field, inputClass } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { paymentsUnlocked, resetDemoData, saveClassType, saveProduct, saveSettings } from "../actions";
import { env } from "@/lib/env";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, { data: types }, { data: products }, unlocked] = await Promise.all([
    getSettings(),
    db().from("class_types").select("*").order("sort_order"),
    db().from("products").select("*").order("sort_order"),
    paymentsUnlocked(),
  ]);
  const n = (id: string, label: string, value: number, hint?: string, step = 1) => (
    <Field id={id} label={label} hint={hint}><input id={id} name={id} type="number" step={step} min={0} defaultValue={value} className={inputClass} /></Field>
  );
  const t = (id: string, label: string, value: string, hint?: string) => (
    <Field id={id} label={label} hint={hint}><input id={id} name={id} defaultValue={value} className={inputClass} /></Field>
  );

  return (
    <div className="space-y-6">
      <AdminTitle title="Settings" sub="Times are in Europe/Nicosia; prices in EUR." />

      {env.demoMode && (
        <section className="card border-mauve/50 bg-mauve-soft/50 px-5 py-5">
          <h2 className="display mb-1 text-[0.95rem]">Demo data</h2>
          <p className="mb-4 text-sm text-ink-soft">Wipe all clients, bookings, payments and messages and rebuild fresh demo data. Your settings, class types and admin login are kept. Only available while DEMO_MODE is on.</p>
          <ActionForm action={resetDemoData} submit="Reset demo data" variant="ghost" confirm="Reset all demo clients and bookings?" />
        </section>
      )}

      <section className="card px-5 py-5">
        <h2 className="display mb-4 text-[0.95rem]">Booking rules</h2>
        <ActionForm action={saveSettings} submit="Save settings">
          <div className="grid grid-cols-2 gap-3">
            {n("cancellation_cutoff_hours", "Cancellation cutoff (hours)", s.cancellation_cutoff_hours)}
            {n("waitlist_window_hours", "Waitlist claim window (hours)", s.waitlist_window_minutes / 60, undefined, 0.25)}
            {n("hold_minutes", "Payment hold (minutes)", s.hold_minutes)}
            {t("reminder_offsets", "Reminders (hours before)", s.reminder_offsets_minutes.map((m) => m / 60).join(", "), "e.g. 24, 2")}
          </div>
          <Checkbox id="refund_late_cancel_if_filled" name="refund_late_cancel_if_filled" defaultChecked={s.refund_late_cancel_if_filled}>
            Return the credit for a late cancellation if the spot gets re-booked
          </Checkbox>
          <h3 className="display pt-3 text-[0.85rem]">Payments</h3>
          <Checkbox id="online_payments_enabled" name="online_payments_enabled" defaultChecked={s.online_payments_enabled} disabled={!unlocked}>
            Online payments (Stripe){process.env.DEMO_MODE === "true" ? ", test mode in this demo" : ""}
          </Checkbox>
          {!unlocked && <p className="-mt-2 pl-8 text-xs text-ink-soft">Locked until every item under “Before online payments” is ticked in <a href="/admin/compliance" className="underline">Compliance</a>. Until then clients pay at the studio.</p>}
          <Checkbox id="allow_pay_later" name="allow_pay_later" defaultChecked={s.allow_pay_later}>Allow booking one class before paying (your policy: off, everything is paid in advance)</Checkbox>
          <div className="grid grid-cols-2 gap-3">
            {n("unpaid_request_expiry_hours", "Unpaid requests expire after (hours)", s.unpaid_request_expiry_hours)}
            {n("expiry_reminder_days", "Expiry reminder (days before)", s.expiry_reminder_days)}
            {n("student_discount_pct", "Student discount (%)", s.student_discount_pct, "Group packages only")}
          </div>
          {t("revolut_link", "Revolut payment link", s.revolut_link, "e.g. https://revolut.me/yourname")}
          <div className="grid grid-cols-2 gap-3">
            {t("bank_account_name", "Bank account name", s.bank_account_name)}
            {t("bank_iban", "IBAN", s.bank_iban, "Clients use their booking code as the reference")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="membership_period_mode" label="Monthly package period">
              <select id="membership_period_mode" name="membership_period_mode" defaultValue={s.membership_period_mode} className={inputClass}>
                <option value="rolling">Rolling 30 days from purchase</option><option value="calendar">Calendar month</option>
              </select>
            </Field>
            {n("rollover_max", "Max classes rolling over", s.rollover_max, "0 = none")}
          </div>
          <h3 className="display pt-3 text-[0.85rem]">Studio details</h3>
          {t("status_banner", "Status banner (optional)", s.status_banner, "Shown on every page, e.g. “DM us on Instagram to book while we fix an issue”. Leave empty to hide.")}
          {t("intro_line", "Home page intro", s.intro_line)}
          {t("legal_name", "Trading name", s.legal_name)}
          {t("trader_name", "Your full name (the trader)", s.trader_name, "EU law requires identifying the seller, even for individuals.")}
          {t("address", "Studio address", s.address)}
          <div className="grid grid-cols-2 gap-3">
            {t("contact_email", "Email", s.contact_email)}
            {t("contact_phone", "Phone", s.contact_phone)}
            {t("instagram_handle", "Instagram", s.instagram_handle)}
            {t("policy_version", "Policy version", s.policy_version, "Change when the policy text changes")}
          </div>
        </ActionForm>
      </section>

      <section>
        <h2 className="display mb-3 text-[0.95rem]">Class types</h2>
        <div className="space-y-3">
          {[...(types ?? []), null].map((ct) => (
            <details key={ct?.id ?? "new"} className="card px-5 py-3" open={!ct ? false : undefined}>
              <summary className="flex min-h-11 cursor-pointer items-center justify-between font-medium text-ink">
                {ct ? ct.name : "+ Add a class type"}
                {ct && <span className="text-sm font-normal text-ink-soft">cap {ct.default_capacity} · {ct.default_duration_minutes} min · €{(ct.price_cents / 100).toFixed(2)}{ct.active ? "" : " · hidden"}</span>}
              </summary>
              <div className="pb-3 pt-3">
                <ActionForm action={saveClassType.bind(null, ct?.id ?? null)} submit={ct ? "Save" : "Add class type"} variant="soft">
                  <Field id={`name-${ct?.id}`} label="Name"><input id={`name-${ct?.id}`} name="name" defaultValue={ct?.name ?? ""} placeholder="e.g. Private session" className={inputClass} /></Field>
                  <Field id={`kind-${ct?.id}`} label="Kind" hint="Reformer and mat classes accept credits of their type; events are paid individually.">
                    <select id={`kind-${ct?.id}`} name="kind" defaultValue={ct?.kind ?? "reformer"} className={inputClass}><option value="reformer">Reformer</option><option value="mat">Mat</option><option value="event">Event / private (paid individually)</option></select>
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field id={`cap-${ct?.id}`} label="Capacity"><input id={`cap-${ct?.id}`} name="default_capacity" type="number" min={1} max={100} defaultValue={ct?.default_capacity ?? 3} className={inputClass} /></Field>
                    <Field id={`dur-${ct?.id}`} label="Minutes"><input id={`dur-${ct?.id}`} name="default_duration_minutes" type="number" min={10} defaultValue={ct?.default_duration_minutes ?? 50} className={inputClass} /></Field>
                    <Field id={`price-${ct?.id}`} label="Price €"><input id={`price-${ct?.id}`} name="price" inputMode="decimal" defaultValue={ct ? (ct.price_cents / 100).toFixed(2) : "20.00"} className={inputClass} /></Field>
                  </div>
                  <Field id={`cost-${ct?.id}`} label="Classes (credits) used per booking" hint="e.g. 2 for a private session"><input id={`cost-${ct?.id}`} name="credit_cost" type="number" min={1} max={10} defaultValue={ct?.credit_cost ?? 1} className={inputClass} /></Field>
                  <Field id={`loc-${ct?.id}`} label="Default location"><input id={`loc-${ct?.id}`} name="default_location" defaultValue={ct?.default_location ?? ""} className={inputClass} /></Field>
                  <Field id={`desc-${ct?.id}`} label="Description"><textarea id={`desc-${ct?.id}`} name="description" rows={2} defaultValue={ct?.description ?? ""} className={`${inputClass} py-3`} /></Field>
                  <Checkbox id={`active-${ct?.id}`} name="active" defaultChecked={ct?.active ?? true}>Active</Checkbox>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="display mb-3 text-[0.95rem]">Packages &amp; packs</h2>
        <div className="space-y-3">
          {(products ?? []).map((p) => (
            <details key={p.id} className="card px-5 py-3">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between font-medium text-ink">{p.name}<span className="text-sm font-normal text-ink-soft">€{(p.price_cents / 100).toFixed(2)}{p.active ? "" : " · hidden"}</span></summary>
              <div className="pb-3 pt-3">
                <ActionForm action={saveProduct.bind(null, p.id)} submit="Save" variant="soft">
                  <Field id={`pn-${p.id}`} label="Name"><input id={`pn-${p.id}`} name="name" defaultValue={p.name} className={inputClass} /></Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field id={`pc-${p.id}`} label="Credits"><input id={`pc-${p.id}`} name="credits" type="number" min={1} defaultValue={p.credits} className={inputClass} /></Field>
                    <Field id={`pp-${p.id}`} label="Price €"><input id={`pp-${p.id}`} name="price" inputMode="decimal" defaultValue={(p.price_cents / 100).toFixed(2)} className={inputClass} /></Field>
                    {p.kind === "membership"
                      ? <Field id={`pd-${p.id}`} label="Period days"><input id={`pd-${p.id}`} name="period_days" type="number" min={7} defaultValue={p.period_days ?? 30} className={inputClass} /></Field>
                      : <Field id={`pv-${p.id}`} label="Valid days"><input id={`pv-${p.id}`} name="validity_days" type="number" min={1} defaultValue={p.validity_days ?? ""} className={inputClass} /></Field>}
                  </div>
                  <Field id={`pdesc-${p.id}`} label="Short description"><input id={`pdesc-${p.id}`} name="description" defaultValue={p.description ?? ""} className={inputClass} /></Field>
                  <Checkbox id={`pa-${p.id}`} name="active" defaultChecked={p.active}>On sale</Checkbox>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
