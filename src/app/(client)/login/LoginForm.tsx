"use client";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { useFocusOnError } from "@/lib/focus-error";
import { Button, ButtonLink, Field, Notice, inputClass } from "@/components/ui";
import { keepValues } from "@/lib/keep-form";
import { confirmEmail, requestReset, resendCode, resetPassword, signIn, type AuthState } from "./actions";

const codeClass = `${inputClass} text-center font-serif text-3xl tracking-[0.35em]`;

/** The 6-digit code from the email (confirming a new account). */
export function CodeStep({ email, demoCode, next, onChange }: { email: string; demoCode?: string; next: string; onChange?: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(confirmEmail, { ok: false });
  const [resent, resend, resending] = useActionState<AuthState, FormData>(resendCode, { ok: false });
  const code = resent.demoCode ?? demoCode;
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, resent.error ? resent : state, !!(state.error || resent.error));
  return (
    <form ref={form} onSubmit={keepValues(action)} className="space-y-4" noValidate>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm leading-relaxed text-ink-soft" aria-live="polite">
        We sent a code to <strong className="font-medium text-ink">{email}</strong> to confirm it&apos;s you. You only do this once.
        {onChange && <> <button type="button" onClick={onChange} className="min-h-11 font-medium text-ink underline underline-offset-4">Change</button></>}
      </p>
      {code && <Notice>Demo: no email is sent. Your code is filled in below.</Notice>}
      <Field id="code" label="Code from your email" error={state.error ?? resent.error}>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={12} required
          defaultValue={code} key={code ?? "code"} placeholder="••••••" className={codeClass} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Checking…" : "Confirm"}</Button>
      {/* Not a submit button: the form's onSubmit (keepValues) would send it to confirmEmail instead. */}
      <button type="button" disabled={resending} onClick={(e) => { const f = new FormData(e.currentTarget.form!); startTransition(() => resend(f)); }} className="mx-auto block min-h-11 text-sm font-medium text-ink underline underline-offset-4">
        {resent.ok ? "New code sent" : "Send a new code"}
      </button>
    </form>
  );
}

function ForgotPassword({ next, email, onBack }: { next: string; email?: string; onBack: () => void }) {
  const [req, request, requesting] = useActionState<AuthState, FormData>(requestReset, { ok: false });
  const [res, reset, resetting] = useActionState<AuthState, FormData>(resetPassword, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, req.error ? req : res, !!(req.error || res.error || Object.keys(res.errors ?? {}).length));
  if (!(req.ok && req.step === "code")) {
    return (
      <form ref={form} onSubmit={keepValues(request)} className="space-y-4" noValidate>
        <h2 className="text-center font-medium text-ink">Reset your password</h2>
        <Field id="reset-email" label="Email" error={req.error} hint="We'll email you a code to choose a new password.">
          <input id="reset-email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={email} className={inputClass} />
        </Field>
        <Button type="submit" disabled={requesting} className="w-full">{requesting ? "Sending…" : "Email me a code"}</Button>
        <button type="button" onClick={onBack} className="mx-auto block min-h-11 text-sm font-medium text-ink underline underline-offset-4">Back to sign in</button>
      </form>
    );
  }
  const e = res.errors ?? {};
  return (
    <form ref={form} onSubmit={keepValues(reset)} className="space-y-4" noValidate>
      <input type="hidden" name="email" value={req.email} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm leading-relaxed text-ink-soft" aria-live="polite">
        If there&apos;s an account for <strong className="font-medium text-ink">{req.email}</strong>, we&apos;ve emailed a code. Enter it and choose a new password.
      </p>
      {req.demoCode && <Notice>Demo: no email is sent. Your code is filled in below.</Notice>}
      <Field id="reset-code" label="Code from your email" error={res.error}>
        <input id="reset-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={12} required defaultValue={req.demoCode} placeholder="••••••" className={codeClass} />
      </Field>
      {/* The hidden username lets password managers save the new password against the right email. */}
      <input type="email" name="username" autoComplete="username" value={req.email} readOnly hidden />
      <Field id="new-password" label="New password" error={e.password} hint="At least 8 characters.">
        <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <Field id="new-confirm" label="Confirm new password" error={e.confirm}>
        <input id="new-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <Button type="submit" disabled={resetting} className="w-full">{resetting ? "Saving…" : "Save password and sign in"}</Button>
    </form>
  );
}

export function LoginForm({ next, demo }: { next: string; demo: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, { ok: false });
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state, !!state.error);

  if (mode === "forgot") return <ForgotPassword next={next} email={email} onBack={() => setMode("signin")} />;
  if (state.ok && state.step === "code" && state.email) return <CodeStep email={state.email} demoCode={state.demoCode} next={next} />;

  return (
    <div className="space-y-5">
      <form ref={form} onSubmit={keepValues(action)} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Field id="email" label="Email">
          <input id="email" name="email" type="email" inputMode="email" autoComplete="username" required aria-invalid={state.error ? true : undefined}
            onChange={(ev) => setEmail(ev.target.value)} placeholder="you@example.com" className={inputClass} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={state.error ? true : undefined} className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
        <button type="button" onClick={() => setMode("forgot")} className="mx-auto block min-h-11 text-sm font-medium text-ink underline underline-offset-4">Forgot password?</button>
      </form>
      {demo && (
        <Notice>Demo: sign in as a demo client, e.g. <strong>elena@example.com</strong> with password <strong>reform-demo</strong>, or create your own account (codes appear on screen).</Notice>
      )}
      <div className="border-t border-line pt-5 text-center">
        <p className="mb-3 text-sm text-ink-soft">New to Re·Form?</p>
        <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} variant="soft" className="w-full">Create account</ButtonLink>
      </div>
      <p className="text-center text-xs text-ink-soft">Studio team: sign in here with your email and password; you&apos;ll go straight to the studio. <Link href="/legal/privacy" className="underline underline-offset-4">Privacy</Link></p>
    </div>
  );
}
