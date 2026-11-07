"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button, Checkbox, Field, Notice, inputClass } from "@/components/ui";
import Link from "next/link";
import { CONDITIONS, POSTPARTUM, needsClearance, needsHealthConsent } from "@/lib/health";
import { dotDate } from "@/lib/time";
import { keepValues } from "@/lib/keep-form";
import { useFocusOnError } from "@/lib/focus-error";
import { saveHealth, type HealthState } from "./actions";

export type HealthInitial = {
  answered: boolean; inPerson: boolean; conditions: string[]; details: string; pregnancy: string; pregnancyWeeks: string;
  postpartumMonths: string; bpMeds: string; medication: string;
};

const chip = "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-4 py-2.5 text-sm text-ink has-[:checked]:border-plum-700 has-[:checked]:bg-lilac-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lilac-300";

/** Step 1: tick what applies (or tell her in person). Step 2: details, pregnancy, medication, consent. */
export function HealthWizard({ initial, next, studio, instructor, consentedAt }: {
  initial: HealthInitial; next: string; studio: string; instructor: string | null; consentedAt: string | null;
}) {
  const [state, action, pending] = useActionState<HealthState, FormData>(saveHealth, { ok: false });
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<string[]>(initial.conditions);
  const [inPerson, setInPerson] = useState(initial.answered && initial.inPerson);
  const [none, setNone] = useState(initial.answered && !initial.inPerson && !initial.conditions.length);
  const [medication, setMedication] = useState(initial.medication);
  const [pregnancy, setPregnancy] = useState(initial.pregnancy);
  const [postpartum, setPostpartum] = useState(initial.postpartumMonths);
  const [bp, setBp] = useState(initial.bpMeds);
  // A-071: moving between steps tells a screen reader and moves focus to "Step n of 2".
  const stepRef = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state, !!state.error);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } stepRef.current?.focus(); }, [step]);
  const toggle = (k: string) => { setNone(false); setInPerson(false); setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k])); };
  const pregnant = picked.includes("pregnancy");
  // Same rule as the server (A-105): the consent box shows whenever something would be stored.
  const consentNeeded = needsHealthConsent({ conditions: none ? [] : picked, bpMeds: bp === "yes", medication });
  const clearance = needsClearance({ conditions: picked, pregnancy, postpartum_months: postpartum === "" ? null : Number(postpartum) });

  return (
    <form ref={form} onSubmit={keepValues(action)} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <p ref={stepRef} tabIndex={-1} role="status" aria-live="polite" className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft outline-none">Step {step} of 2</p>

      <div className={step === 1 ? "space-y-4" : "hidden"}>
        <fieldset>
          <legend className="text-[1.05rem] font-medium text-ink">Does any of this apply to you, now or in the past?</legend>
          <p className="mb-3 mt-1 text-sm text-ink-soft">Tick everything that applies, even small things. It helps your instructor adapt each exercise for you.</p>
          <div className="space-y-2">
            <label className={chip}>
              <input type="checkbox" name="none" checked={none} onChange={(e) => { setNone(e.target.checked); if (e.target.checked) { setPicked([]); setInPerson(false); } }} className="size-5 shrink-0 accent-ink" />
              <span className="font-medium">No injuries or medical conditions</span>
            </label>
            {CONDITIONS.map((c) => (
              <label key={c.key} className={chip}>
                <input type="checkbox" name="condition" value={c.key} checked={picked.includes(c.key)} onChange={() => toggle(c.key)} className="size-5 shrink-0 accent-ink" />
                {c.label}
              </label>
            ))}
            <label className={`${chip} mt-3`}>
              <input type="checkbox" name="in_person" checked={inPerson} onChange={(e) => { setInPerson(e.target.checked); if (e.target.checked) { setPicked([]); setNone(false); } }} className="size-5 shrink-0 accent-ink" />
              <span className="font-medium">I&apos;d rather tell my instructor in person</span>
            </label>
          </div>
        </fieldset>
        <Button type="button" className="w-full" disabled={!none && !inPerson && !picked.length} onClick={() => { setStep(2); window.scrollTo({ top: 0 }); }}>Next</Button>
      </div>

      <div className={step === 2 ? "space-y-5" : "hidden"}>
        <button type="button" onClick={() => setStep(1)} className="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-sm font-medium text-ink hover:bg-lilac-100">
          <ChevronLeft aria-hidden size={20} /> Back to the list
        </button>

        {inPerson && (
          <Notice>
            Nothing is stored. Please tell {instructor ?? "your instructor"} about any injury, condition, pregnancy or medication before your first class.
          </Notice>
        )}

        {!none && picked.length > 0 && (
          <Field id="details" label="Tell us a little more" hint="About what you ticked: when it happened, where it hurts, what makes it better or worse.">
            <textarea id="details" name="details" rows={4} defaultValue={initial.details} className={`${inputClass} py-3`} />
          </Field>
        )}

        {pregnant && (
          <fieldset className="space-y-3 rounded-2xl border border-line bg-white/70 p-4">
            <legend className="px-1 text-sm font-medium text-ink">Pregnancy</legend>
            <div className="grid grid-cols-2 gap-2">
              {[["current", "I'm pregnant now"], ["past", "In the past"]].map(([v, l]) => (
                <label key={v} className={`${chip} justify-center`}>
                  <input type="radio" name="pregnancy" value={v} checked={pregnancy === v} onChange={() => setPregnancy(v)} className="sr-only" />{l}
                </label>
              ))}
            </div>
            {pregnancy === "current" && (
              <Field id="pregnancy_weeks" label="How many weeks along are you?">
                <input id="pregnancy_weeks" name="pregnancy_weeks" type="number" inputMode="numeric" min={1} max={45} defaultValue={initial.pregnancyWeeks} className={inputClass} />
              </Field>
            )}
            {pregnancy === "past" && (
              <Field id="postpartum_months" label="How long ago did you give birth?">
                <select id="postpartum_months" name="postpartum_months" value={postpartum} onChange={(e) => setPostpartum(e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {POSTPARTUM.map((o) => <option key={o.months} value={o.months}>{o.label}</option>)}
                </select>
              </Field>
            )}
          </fieldset>
        )}

        {clearance && (
          <Notice>
            <strong className="font-medium">Doctor&apos;s note needed.</strong>{" "}
            {picked.includes("surgery") && (pregnancy === "current" || (pregnant && pregnancy === "past")) ? "Because of your recent surgery and pregnancy, " : picked.includes("surgery") ? "Because of your recent surgery, " : "During pregnancy and for the first 3 months after giving birth, "}
            please bring a written note from your doctor confirming you&apos;re physically cleared to do Pilates, before your first class.
          </Notice>
        )}

        <fieldset className={inPerson ? "hidden" : undefined} disabled={inPerson}>
          <legend className="mb-2 text-sm font-medium text-ink">Are you currently taking any medication that can affect your blood pressure or heart? <span className="font-normal text-ink-soft">(required)</span></legend>
          <div className="grid grid-cols-2 gap-2">
            {[["no", "No"], ["yes", "Yes"]].map(([v, l]) => (
              <label key={v} className={`${chip} justify-center`}>
                <input type="radio" name="bp_meds" value={v} checked={bp === v} onChange={() => setBp(v)} className="sr-only" />{l}
              </label>
            ))}
          </div>
        </fieldset>

        {!inPerson && (
          <Field id="medication" label="Any other medication your instructor should know about? (optional)">
            <input id="medication" name="medication" value={medication} onChange={(e) => setMedication(e.target.value)} className={inputClass} />
          </Field>
        )}

        {!inPerson && consentNeeded && (consentedAt ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            You consented to us keeping your health information on {dotDate(consentedAt)}. You can withdraw it any time in{" "}
            <Link href="/account#health" className="underline underline-offset-4">Account → Health</Link>.
          </p>
        ) : (
          <Checkbox id="health_consent" name="health_consent" defaultChecked={false}>
            I give my explicit consent to {instructor ? `${instructor} (${studio})` : studio} storing the health information above so my instructor can keep me safe and adapt exercises. Only my instructor can see it; it&apos;s never emailed or shared. I can withdraw this consent at any time in Account → Health → Delete my health information.
          </Checkbox>
        ))}

        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
