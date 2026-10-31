"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button, Checkbox, Field, Notice, inputClass } from "@/components/ui";
import { PhotoConsentField } from "@/components/ProfileFields";
import { keepValues } from "@/lib/keep-form";
import { signUp, type AuthState } from "../login/actions";
import { CodeStep } from "../login/LoginForm";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, { ok: false });
  if (state.ok && state.step === "code" && state.email) return <CodeStep email={state.email} demoCode={state.demoCode} next={next} />;
  const e = state.errors ?? {};
  const err = (k: string) => ({ "aria-invalid": !!e[k], "aria-describedby": e[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={keepValues(action)} className="space-y-5" noValidate>
      {(state.error || Object.keys(e).length > 0) && <Notice tone="error">{state.error ?? "Please check the highlighted fields below."}</Notice>}
      <div className="grid grid-cols-2 gap-3">
        <Field id="first_name" label="Name" error={e.first_name}>
          <input id="first_name" name="first_name" autoComplete="given-name" required className={inputClass} {...err("first_name")} />
        </Field>
        <Field id="last_name" label="Surname" error={e.last_name}>
          <input id="last_name" name="last_name" autoComplete="family-name" required className={inputClass} {...err("last_name")} />
        </Field>
      </div>
      <Field id="date_of_birth" label="Date of birth" error={e.date_of_birth} hint="Classes are for adults (18+).">
        <input id="date_of_birth" name="date_of_birth" type="date" autoComplete="bday" required className={inputClass} {...err("date_of_birth")} />
      </Field>
      <Field id="email" label="Email" error={e.email} hint="You'll use it to sign in.">
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" required className={inputClass} {...err("email")} />
      </Field>
      <Field id="phone" label="Mobile number" error={e.phone}>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+357 99 123456" className={inputClass} {...err("phone")} />
      </Field>
      <Field id="password" label="Password" error={e.password} hint="At least 8 characters. Your phone can save it for next time.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} {...err("password")} />
      </Field>
      <Field id="confirm" label="Confirm password" error={e.confirm}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} {...err("confirm")} />
      </Field>

      <PhotoConsentField />

      <fieldset className="space-y-1">
        <legend className="sr-only">Agreements</legend>
        <Checkbox id="policy" name="policy" required aria-describedby={e.policy ? "policy-error" : undefined}>
          I accept the <Link href="/policy" target="_blank" className="font-medium underline underline-offset-4">Studio Rules</Link>, the{" "}
          <Link href="/policy/payments" target="_blank" className="font-medium underline underline-offset-4">Payments &amp; Cancellation Policy</Link> and the{" "}
          <Link href="/legal/terms" target="_blank" className="font-medium underline underline-offset-4">Terms</Link>.
        </Checkbox>
        {e.policy && <p id="policy-error" className="pl-8 text-xs font-medium text-burgundy">{e.policy}</p>}
        <Checkbox id="fitness" name="fitness" required aria-describedby={e.fitness ? "fitness-error" : undefined}>
          I confirm I&apos;m fit to exercise and will tell my instructor about any injury, condition or pregnancy (
          <Link href="/legal/health" target="_blank" className="font-medium underline underline-offset-4">Health &amp; Safety</Link>).
        </Checkbox>
        {e.fitness && <p id="fitness-error" className="pl-8 text-xs font-medium text-burgundy">{e.fitness}</p>}
        <Checkbox id="marketing_email" name="marketing_email">Send me news about new schedules and events (optional).</Checkbox>
      </fieldset>

      <p className="text-xs leading-relaxed text-ink-soft">
        We use your details to manage your bookings. See our <Link href="/legal/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
      </p>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create account"}</Button>
      <p className="text-center text-sm text-ink-soft">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-ink underline underline-offset-4">Sign in</Link></p>
    </form>
  );
}
