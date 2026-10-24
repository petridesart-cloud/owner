"use client";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Notice, inputClass } from "@/components/ui";
import { completeWelcome, type WelcomeState } from "./actions";
import { HealthFields, PhotoConsentField } from "@/components/ProfileFields";
import { ParqFields } from "@/components/ParqFields";
import { keepValues } from "@/lib/keep-form";

export function WelcomeForm({ email, first, last, phone, next }: { email: string; first: string; last: string; phone: string; next: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<WelcomeState, FormData>(completeWelcome, { ok: false });
  const e = state.errors ?? {};
  useEffect(() => { if (state.ok && state.redirect) { router.replace(state.redirect); } }, [state, router]);
  const err = (k: string) => ({ "aria-invalid": !!e[k], "aria-describedby": e[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={keepValues(action)} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {Object.keys(e).length > 0 && <Notice tone="error">Please check the highlighted fields below.</Notice>}
      <div className="grid grid-cols-2 gap-3">
        <Field id="first_name" label="First name" error={e.first_name}>
          <input id="first_name" name="first_name" autoComplete="given-name" required defaultValue={first} className={inputClass} {...err("first_name")} />
        </Field>
        <Field id="last_name" label="Surname" error={e.last_name}>
          <input id="last_name" name="last_name" autoComplete="family-name" required defaultValue={last} className={inputClass} {...err("last_name")} />
        </Field>
      </div>
      <Field id="phone" label="Mobile number" error={e.phone} hint="For class reminders and if we need to reach you about a class.">
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={phone} placeholder="+357 99 123456" className={inputClass} {...err("phone")} />
      </Field>
      <Field id="email" label="Email">
        <input id="email" value={email} readOnly className={`${inputClass} bg-lilac-50 text-ink-soft`} />
      </Field>
      <Field id="date_of_birth" label="Date of birth" error={e.date_of_birth}>
        <input id="date_of_birth" name="date_of_birth" type="date" autoComplete="bday" required className={inputClass} {...err("date_of_birth")} />
      </Field>

      <div className="rounded-[var(--radius-card)] border border-line bg-white/60 p-4">
        <ParqFields error={e.parq} />
      </div>

      <fieldset className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white/60 p-4">
        <legend className="px-1 text-sm font-medium text-ink">Anything your instructor should know? <span className="font-normal text-ink-soft">(optional)</span></legend>
        <HealthFields error={e.health_consent} />
      </fieldset>

      <PhotoConsentField />

      <fieldset className="space-y-1">
        <legend className="sr-only">Agreements</legend>
        <Checkbox id="policy" name="policy" required aria-describedby={e.policy ? "policy-error" : undefined}>
          I accept the <Link href="/policy" target="_blank" className="font-medium underline underline-offset-4">Studio Rules</Link> and the{" "}
          <Link href="/policy/payments" target="_blank" className="font-medium underline underline-offset-4">Payments, Cancellation &amp; Membership Policy</Link>{" "}
          (and the <Link href="/legal/terms" target="_blank" className="font-medium underline underline-offset-4">Terms</Link>).
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
        <Checkbox id="marketing_email" name="marketing_email">Send me news about new schedules and events.</Checkbox>
        <p className="text-xs text-ink-soft">Booking confirmations and reminders are always sent. Unsubscribe from news any time.</p>
      </fieldset>

      <p className="text-xs leading-relaxed text-ink-soft">
        We use your details to manage your bookings. See our <Link href="/legal/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
      </p>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Continue"}</Button>
    </form>
  );
}
