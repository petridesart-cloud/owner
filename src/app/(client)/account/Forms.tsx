"use client";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { useFocusOnError } from "@/lib/focus-error";
import { Button, Checkbox, Field, Notice, inputClass } from "@/components/ui";
import { PhotoConsentField } from "@/components/ProfileFields";
import { saveNotifications, saveProfile, type SaveState } from "./actions";
import { keepValues } from "@/lib/keep-form";

type P = {
  first: string; last: string; phone: string; email: string; dob: string; goal: string;
  ecName: string; ecPhone: string; ecRelation: string; photos: string | null;
};

export function ProfileForm({ p, next }: { p: P; next?: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProfile, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state, !!state.error);
  return (
    <form ref={form} onSubmit={keepValues(action)} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="grid grid-cols-2 gap-3">
        <Field id="first_name" label="First name"><input id="first_name" name="first_name" autoComplete="given-name" defaultValue={p.first} className={inputClass} /></Field>
        <Field id="last_name" label="Surname"><input id="last_name" name="last_name" autoComplete="family-name" defaultValue={p.last} className={inputClass} /></Field>
      </div>
      <Field id="date_of_birth" label="Date of birth"><input id="date_of_birth" name="date_of_birth" type="date" autoComplete="bday" required defaultValue={p.dob} className={inputClass} /></Field>
      <Field id="email" label="Email" hint="Your sign-in email. Ask the studio to change it."><input id="email" value={p.email} readOnly className={`${inputClass} bg-lilac-50 text-ink-soft`} /></Field>
      <Field id="phone" label="Mobile number"><input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={p.phone} className={inputClass} /></Field>
      <Field id="goal" label="Your goal (optional)" hint="e.g. a stronger core, posture, getting back after a baby.">
        <input id="goal" name="goal" maxLength={200} defaultValue={p.goal} className={inputClass} />
      </Field>

      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="pt-4 text-sm font-medium text-ink">Emergency contact</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="emergency_contact_name" label="Name"><input id="emergency_contact_name" name="emergency_contact_name" defaultValue={p.ecName} className={inputClass} /></Field>
          <Field id="emergency_contact_phone" label="Phone"><input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={p.ecPhone} className={inputClass} /></Field>
        </div>
        <Field id="emergency_contact_relation" label="Relation (optional)"><input id="emergency_contact_relation" name="emergency_contact_relation" maxLength={40} placeholder="e.g. Partner, Mum, Friend" defaultValue={p.ecRelation} className={inputClass} /></Field>
      </fieldset>

      <div className="border-t border-line pt-4"><PhotoConsentField value={p.photos} /></div>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && (
        <Notice tone="success">
          {state.message}
          {state.back && <> <Link href={state.back} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Back to your class →</Link></>}
        </Notice>
      )}
      <Button type="submit" variant="soft" disabled={pending} className="w-full">{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}

/** Reminders and news: their own section, saved on their own (A-078). `when` is how reminders are timed (A-073). */
export function NotificationsForm({ me, reminders, when }: { me: boolean; reminders: boolean; when: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveNotifications, { ok: false });
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <Checkbox id="reminder_emails" name="reminder_emails" defaultChecked={reminders}>Remind me before each class{when ? ` (${when} ahead)` : ""}</Checkbox>
      <Checkbox id="marketing_email" name="marketing_email" defaultChecked={me}>Email me about new schedules and events</Checkbox>
      <p className="text-xs leading-relaxed text-ink-soft">Booking confirmations, cancellations and waitlist news are always sent.</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" variant="soft" disabled={pending} className="w-full">{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}
