"use client";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Notice, inputClass } from "@/components/ui";
import { completeWelcome, type WelcomeState } from "./actions";

export function WelcomeForm({ email, name, phone, next }: { email: string; name: string; phone: string; next: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<WelcomeState, FormData>(completeWelcome, { ok: false });
  const e = state.errors ?? {};
  useEffect(() => { if (state.ok && state.redirect) { router.replace(state.redirect); } }, [state, router]);
  const err = (k: string) => ({ "aria-invalid": !!e[k], "aria-describedby": e[k] ? `${k}-error` : undefined });

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {Object.keys(e).length > 0 && <Notice tone="error">Please check the highlighted fields below.</Notice>}
      <Field id="full_name" label="Full name" error={e.full_name}>
        <input id="full_name" name="full_name" autoComplete="name" required defaultValue={name} className={inputClass} {...err("full_name")} />
      </Field>
      <Field id="phone" label="Mobile number" error={e.phone} hint="For class reminders and if we need to reach you about a class.">
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={phone} placeholder="+357 99 123456" className={inputClass} {...err("phone")} />
      </Field>
      <Field id="email" label="Email">
        <input id="email" value={email} readOnly className={`${inputClass} bg-lilac-50 text-ink-soft`} />
      </Field>

      <fieldset className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white/60 p-4">
        <legend className="px-1 text-sm font-medium text-ink">Anything your instructor should know? <span className="font-normal text-ink-soft">(optional)</span></legend>
        <Field id="health_note" label="Injuries, conditions or pregnancy" hint="Only your instructor can see this. You can edit or delete it any time in your account.">
          <textarea id="health_note" name="health_note" rows={3} className={`${inputClass} py-3`} placeholder="e.g. recovering from a knee injury" />
        </Field>
        <Checkbox id="health_consent" name="health_consent" aria-describedby={e.health_consent ? "health_consent-error" : undefined}>
          I consent to Re·Form storing this health information so my instructor can adapt exercises for me. I can withdraw consent at any time.
        </Checkbox>
        {e.health_consent && <p id="health_consent-error" className="text-xs font-medium text-burgundy">{e.health_consent}</p>}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="sr-only">Agreements</legend>
        <Checkbox id="policy" name="policy" required aria-describedby={e.policy ? "policy-error" : undefined}>
          I accept the <Link href="/policy" target="_blank" className="font-medium underline underline-offset-4">Studio Rules</Link> and{" "}
          <Link href="/legal/terms" target="_blank" className="font-medium underline underline-offset-4">Terms</Link>, including the{" "}
          <Link href="/legal/cancellation" target="_blank" className="font-medium underline underline-offset-4">cancellation policy</Link>.
        </Checkbox>
        {e.policy && <p id="policy-error" className="pl-8 text-xs font-medium text-burgundy">{e.policy}</p>}
        <Checkbox id="fitness" name="fitness" required aria-describedby={e.fitness ? "fitness-error" : undefined}>
          I confirm I&apos;m fit to exercise and will tell my instructor about any injury, condition or pregnancy (
          <Link href="/legal/health" target="_blank" className="font-medium underline underline-offset-4">Health &amp; Safety</Link>).
        </Checkbox>
        {e.fitness && <p id="fitness-error" className="pl-8 text-xs font-medium text-burgundy">{e.fitness}</p>}
      </fieldset>

      <fieldset className="space-y-1 border-t border-line pt-4">
        <legend className="pt-4 text-sm font-medium text-ink">News &amp; offers <span className="font-normal text-ink-soft">(optional)</span></legend>
        <Checkbox id="marketing_email" name="marketing_email">Email me about new schedules and events.</Checkbox>
        <Checkbox id="marketing_sms" name="marketing_sms">Text me about new schedules and events.</Checkbox>
        <p className="text-xs text-ink-soft">Booking confirmations and reminders are always sent. Unsubscribe from news any time.</p>
      </fieldset>

      <p className="text-xs leading-relaxed text-ink-soft">
        We use your details to manage your bookings. See our <Link href="/legal/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
      </p>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Continue"}</Button>
    </form>
  );
}
