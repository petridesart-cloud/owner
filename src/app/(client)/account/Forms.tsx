"use client";
import { useActionState } from "react";
import { Button, Checkbox, Field, Notice, inputClass } from "@/components/ui";
import { saveHealthNote, saveProfile, type SaveState } from "./actions";

export function ProfileForm({ name, phone, email, me, ms }: { name: string; phone: string; email: string; me: boolean; ms: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProfile, { ok: false });
  return (
    <form action={action} className="space-y-4">
      <Field id="full_name" label="Full name"><input id="full_name" name="full_name" autoComplete="name" defaultValue={name} className={inputClass} /></Field>
      <Field id="phone" label="Mobile number"><input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={phone} className={inputClass} /></Field>
      <Field id="email" label="Email" hint="Your sign-in email. Contact the studio to change it."><input id="email" value={email} readOnly className={`${inputClass} bg-lilac-50 text-ink-soft`} /></Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">News &amp; offers</legend>
        <Checkbox id="marketing_email" name="marketing_email" defaultChecked={me}>Email me about new schedules and events</Checkbox>
        <Checkbox id="marketing_sms" name="marketing_sms" defaultChecked={ms}>Text me about new schedules and events</Checkbox>
      </fieldset>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" variant="soft" disabled={pending} className="w-full">{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}

export function HealthForm({ note }: { note: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveHealthNote, { ok: false });
  return (
    <form action={action} className="space-y-3">
      <Field id="note" label="Health note" hint="Only your instructor can see this. Clear the box and save to delete it.">
        <textarea id="note" name="note" rows={3} defaultValue={note} className={`${inputClass} py-3`} />
      </Field>
      <Checkbox id="consent" name="consent" defaultChecked={!!note}>I consent to Re·Form storing this health information for my classes.</Checkbox>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" variant="soft" disabled={pending} className="w-full">{pending ? "Saving…" : "Save health note"}</Button>
    </form>
  );
}
