import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Checkbox, Field, inputClass } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { addProduct, createClassType, saveTab, deleteClassType, deleteProduct, paymentsUnlocked, resetDemoData, saveClassType, saveProduct, saveSettings } from "../actions";
import { AddOffer } from "./Offers";
import { getKinds, getTabs } from "@/lib/kinds";
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
  const [s, { data: types }, { data: products }, unlocked, readiness, kindRows] = await Promise.all([
    getSettings(),
    db().from("class_types").select("*").is("archived_at", null).order("sort_order"),
    db().from("products").select("*").is("archived_at", null).or("active.eq.true,kind.neq.membership").order("sort_order"),
    paymentsUnlocked(),
    getSettings().then(launchReadiness),
    getKinds(),
  ]);
  const tabs = await getTabs();
  const kinds = kindRows.map(({ key, label }) => ({ key, label }));
  const kindName = (k: string | null) => kinds.find((x) => x.key === k)?.label ?? k ?? "";
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
            {n("booking_window_weeks", "Clients can book (weeks ahead)", Math.round(s.booking_window_days / 7), "4 = about 1 month, 13 = 3 months (up to 26). Your timetable is always ready 2 weeks further.")}
            {n("cancellation_cutoff_hours", "Free cancellation until (hours before)", s.cancellation_cutoff_hours)}
            {n("expiry_reminder_days", "Remind before package expires (days)", s.expiry_reminder_days)}
            {n("waitlist_close_minutes", "Waitlist stops (minutes before class)", s.waitlist_close_minutes, "Nobody is moved in after this. Yours: 60")}
          </div>
          <Checkbox id="waitlist_sms" name="waitlist_sms" defaultChecked={s.waitlist_sms}>
            Also text people when a waitlist spot is theirs {smsLive() ? "" : "(starts once an SMS account is connected)"}
          </Checkbox>

          </Group>

          <Group title="Studio emails" sub="Emails to you when clients book, sign up, cancel…">
            <Field id="alert_email" label="Send them to" hint={`Leave empty to use your contact email${s.contact_email ? ` (${s.contact_email})` : ""}.`}>
              <input id="alert_email" name="alert_email" type="email" defaultValue={s.alert_email ?? ""} className={inputClass} />
            </Field>
            <fieldset className="space-y-0.5">
              <legend className="mb-1 text-sm font-medium text-ink">Email me when a client…</legend>
              <Checkbox id="alert_bookings" name="alert_bookings" defaultChecked={s.alert_bookings}>books a class or an event (says when a class was empty)</Checkbox>
              <Checkbox id="alert_signups" name="alert_signups" defaultChecked={s.alert_signups}>creates an account</Checkbox>
              <Checkbox id="alert_cancellations" name="alert_cancellations" defaultChecked={s.alert_cancellations}>cancels a class</Checkbox>
              <Checkbox id="alert_requests" name="alert_requests" defaultChecked={s.alert_requests}>requests a package</Checkbox>
              <Checkbox id="alert_details" name="alert_details" defaultChecked={s.alert_details}>changes their details or health answers</Checkbox>
            </fieldset>
            <p className="text-xs text-ink-soft">Changes you make yourself in the studio don&apos;t email you. Health answers are never put in an email.</p>
          </Group>

          <Group title="Message on every page" sub="A banner for news, e.g. a closed week">
          {t("status_banner", "Status banner (optional)", s.status_banner, "e.g. “Studio closed this week, see you Monday!” Leave empty to hide.")}
          </Group>

          <Group title="Advanced" sub="Technical options">
              <div className="grid grid-cols-2 gap-3">
                {n("waitlist_window_hours", "Waitlist claim window (hours)", s.waitlist_window_minutes / 60, undefined, 0.25)}
                {t("reminder_offsets", "Class reminders (hours before)", s.reminder_offsets_minutes.map((m) => m / 60).join(", "), "e.g. 24, 2")}
                {n("hold_minutes", "Online payment hold (minutes)", s.hold_minutes)}
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
        <h2 className="display mb-1 text-[0.95rem]">Packages page</h2>
        <p className="mb-3 text-sm text-ink-soft">
          The tabs clients choose from after &ldquo;Secure your package&rdquo;. Each tab shows the packages, trials and drop-ins of the class types in it.
          A hidden tab is ready but only you can see it (open it from Client view to check it).
        </p>
        <div className="space-y-3">
          {tabs.map((t) => {
            const inTab = kindRows.filter((k) => k.tab === t.key);
            return (
              <details key={t.key} className="card px-5 py-3">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium text-ink">
                  {t.label}
                  <span className="text-right text-sm font-normal text-ink-soft">{inTab.map((k) => k.sub_label || k.label).join(" · ") || "empty"}{t.visible ? "" : " · hidden"}</span>
                </summary>
                <div className="pb-3 pt-3">
                  <ActionForm action={saveTab.bind(null, t.key)} submit="Save" variant="soft">
                    <div className="grid grid-cols-[1fr_5rem] gap-3">
                      <Field id={`tab-${t.key}`} label="Tab name"><input id={`tab-${t.key}`} name="label" defaultValue={t.label} className={inputClass} /></Field>
                      <Field id={`tabsort-${t.key}`} label="Order"><input id={`tabsort-${t.key}`} name="sort" type="number" min={0} defaultValue={t.sort} className={inputClass} /></Field>
                    </div>
                    <Field id={`tabnote-${t.key}`} label="Note at the top (optional)" hint="e.g. how private sessions are arranged.">
                      <textarea id={`tabnote-${t.key}`} name="note" rows={2} defaultValue={t.note ?? ""} className={`${inputClass} py-3`} />
                    </Field>
                    <Checkbox id={`tabvis-${t.key}`} name="visible" defaultChecked={t.visible}>Show this tab to clients</Checkbox>
                    {inTab.map((k) => (
                      <div key={k.key} className="space-y-3 rounded-2xl border border-line p-3">
                        <input type="hidden" name="kinds" value={k.key} />
                        <p className="text-sm font-medium text-ink">{k.label}</p>
                        {inTab.length > 1 && <>
                          <Field id={`sub-${k.key}`} label="Heading in this tab"><input id={`sub-${k.key}`} name={`sub_${k.key}`} defaultValue={k.sub_label ?? ""} placeholder={k.label} className={inputClass} /></Field>
                          <Field id={`desc-${k.key}`} label="Description (optional)"><textarea id={`desc-${k.key}`} name={`desc_${k.key}`} rows={2} defaultValue={k.description ?? ""} className={`${inputClass} py-3`} /></Field>
                        </>}
                        <Field id={`in-${k.key}`} label="In tab">
                          <select id={`in-${k.key}`} name={`tab_${k.key}`} defaultValue={t.key} className={inputClass}>{tabs.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                        </Field>
                      </div>
                    ))}
                  </ActionForm>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="display mb-1 text-[0.95rem]">Class types</h2>
        <p className="mb-3 text-sm text-ink-soft">
          What clients see on the schedule and what you choose in the timetable. Each type says which packages pay for it: Reformer, Mat, or its own
          (e.g. &ldquo;Pre and post natal&rdquo;). Prices come from your packages, trials and drop-ins. Events set their own price, spots and time.
        </p>
        <div className="space-y-3">
          {[...(types ?? []), null].map((ct) => {
            const isEvent = ct?.kind === "event";
            const k = ct?.id ?? "new";
            return (
              <details key={k} className="card px-5 py-3">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium text-ink">
                  {ct ? ct.name : "+ Add a class type"}
                  {ct && <span className="text-right text-sm font-normal text-ink-soft">{isEvent ? "events" : `${ct.default_capacity} spots · ${ct.default_duration_minutes} min · ${kindName(ct.credit_kind)} packages`}{ct.active ? "" : " · off"}</span>}
                </summary>
                <div className="space-y-3 pb-3 pt-3">
                  <ActionForm action={saveClassType.bind(null, ct?.id ?? null)} submit={ct ? "Save" : "Add class type"} variant="soft">
                    <Field id={`name-${k}`} label="Name"><input id={`name-${k}`} name="name" defaultValue={ct?.name ?? ""} placeholder="e.g. Pre and post natal" className={inputClass} /></Field>
                    {!isEvent && (
                      <Field id={`kind-${k}`} label="Paid with" hint="Which packages' classes book it. Its trials and drop-ins follow the same choice.">
                        <select id={`kind-${k}`} name="paid_with" defaultValue={ct?.credit_kind ?? "reformer"} className={inputClass}>
                          {kinds.map((x) => <option key={x.key} value={x.key}>{x.label} packages</option>)}
                          {!ct && <option value="own">Its own packages (a new class type)</option>}
                        </select>
                      </Field>
                    )}
                    {!isEvent && (
                      <div className="grid grid-cols-3 gap-3">
                        <Field id={`cap-${k}`} label="Spots"><input id={`cap-${k}`} name="default_capacity" type="number" min={1} max={100} defaultValue={ct?.default_capacity ?? 3} className={inputClass} /></Field>
                        <Field id={`dur-${k}`} label="Minutes"><input id={`dur-${k}`} name="default_duration_minutes" type="number" min={10} max={600} defaultValue={ct?.default_duration_minutes ?? 50} className={inputClass} /></Field>
                        <Field id={`cost-${k}`} label="Classes used" hint="e.g. 2 for a private"><input id={`cost-${k}`} name="credit_cost" type="number" min={1} max={10} defaultValue={ct?.credit_cost ?? 1} className={inputClass} /></Field>
                      </div>
                    )}
                    <Field id={`loc-${k}`} label="Default location"><input id={`loc-${k}`} name="default_location" defaultValue={ct?.default_location ?? ""} className={inputClass} /></Field>
                    <Field id={`desc-${k}`} label="Description"><textarea id={`desc-${k}`} name="description" rows={2} defaultValue={ct?.description ?? ""} className={`${inputClass} py-3`} /></Field>
                    <Checkbox id={`active-${k}`} name="active" defaultChecked={ct?.active ?? true}>Active (shows in the timetable and when adding classes)</Checkbox>
                    {!isEvent && <Checkbox id={`private-${k}`} name="private" defaultChecked={ct?.private ?? false}>Private: never on the schedule; you book clients in yourself</Checkbox>}
                  </ActionForm>
                  {ct && !isEvent && (
                    <ActionForm action={deleteClassType.bind(null, ct.id)} submit={`Delete ${ct.name}`} variant="ghost"
                      confirm={`Delete ${ct.name}? It's removed from your timetable and lists. Past classes keep it in clients' history.`} />
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="display mb-1 text-[0.95rem]">Packages &amp; single classes</h2>
        <p className="mb-3 text-sm text-ink-soft">Packages, trials and drop-ins for each class type. Change a price or details and clients see it straight away.</p>
        <div className="space-y-5">
          {kinds.filter((x) => (products ?? []).some((p) => p.kind !== "membership" && p.credit_kind === x.key)).map((x) => (
            <div key={x.key} className="space-y-2">
              <h3 className="eyebrow px-1">{x.label}</h3>
              {(products ?? []).filter((p) => p.kind !== "membership" && p.credit_kind === x.key)
                .sort((a, b) => Number(a.tag !== "package") - Number(b.tag !== "package") || a.sort_order - b.sort_order).map((p) => (
                <details key={p.id} className="card px-5 py-3">
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium text-ink">
                    <span>{p.name}{p.tag !== "package" && <span className="block text-xs font-normal text-ink-soft">{p.tag === "trial" ? "Trial" : "Drop-in"}</span>}</span>
                    <span className="shrink-0 text-sm font-normal text-ink-soft">€{(p.price_cents / 100).toFixed(2)}{p.active ? "" : " · not on sale"}</span>
                  </summary>
                  <div className="space-y-3 pb-3 pt-3">
                    <ActionForm action={saveProduct.bind(null, p.id)} submit="Save" variant="soft">
                      {p.tag === "package" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <Field id={`pc-${p.id}`} label="Classes"><input id={`pc-${p.id}`} name="credits" type="number" min={1} defaultValue={p.credits} className={inputClass} /></Field>
                          <Field id={`pm-${p.id}`} label="Months"><input id={`pm-${p.id}`} name="months" type="number" min={1} max={12} defaultValue={p.months ?? 1} className={inputClass} /></Field>
                          <Field id={`pv-${p.id}`} label="Valid (days)" hint="From the first class"><input id={`pv-${p.id}`} name="validity_days" type="number" min={1} max={366} defaultValue={p.validity_days ?? ""} className={inputClass} /></Field>
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
                    <ActionForm action={deleteProduct.bind(null, p.id)} submit="Delete" variant="ghost" confirm={`Delete ${p.name}? Clients who already bought it keep it.`} />
                  </div>
                </details>
              ))}
            </div>
          ))}
          <details className="card px-5 py-3">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink">+ Add a package or single class</summary>
            <div className="pb-3 pt-3"><AddOffer kinds={kinds} addProduct={addProduct} createClassType={createClassType} /></div>
          </details>
        </div>
      </section>
    </div>
  );
}
