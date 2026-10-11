"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { requestCode, verifyCode, type RequestState, type VerifyState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [req, requestAction, requesting] = useActionState<RequestState, FormData>(requestCode, { ok: false });
  const [ver, verifyAction, verifying] = useActionState<VerifyState, FormData>(verifyCode, { ok: false });
  const [editing, setEditing] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const step = req.ok && !editing ? "code" : "email";

  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);
  useEffect(() => { if (ver.ok && ver.redirect) { router.replace(ver.redirect); } }, [ver, router]);

  if (step === "email") {
    return (
      <form action={(f) => { setEditing(false); requestAction(f); }} className="space-y-4" noValidate>
        <Field id="email" label="Email" error={req.error} hint="We'll email you a sign-in code. No password needed.">
          <input
            id="email" name="email" type="email" inputMode="email" autoComplete="email" required
            defaultValue={req.email} placeholder="you@example.com" className={inputClass}
            aria-invalid={!!req.error} aria-describedby={req.error ? "email-error" : "email-hint"}
          />
        </Field>
        <Button type="submit" disabled={requesting} className="w-full">{requesting ? "Sending…" : "Send my code"}</Button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4" noValidate>
      <input type="hidden" name="email" value={req.email} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm leading-relaxed text-ink-soft" aria-live="polite">
        {req.adminCode ? "Studio sign-in for " : req.demoCode ? "Signing in as " : "We sent a code to "}
        <strong className="font-medium text-ink">{req.email}</strong>.{" "}
        <button type="button" onClick={() => setEditing(true)} className="min-h-11 font-medium text-ink underline underline-offset-4">Change</button>
      </p>
      {req.adminCode && <Notice>Enter your studio password.</Notice>}
      {req.demoCode && <Notice>Demo: no email is sent. Your code is filled in below, just tap Continue.</Notice>}
      <Field id="code" label={req.adminCode ? "Studio password" : "Code from your email"} error={ver.error}>
        <input
          ref={codeRef} id="code" name="code" inputMode="numeric" defaultValue={req.demoCode} key={req.demoCode ?? "code"} autoComplete="one-time-code" pattern="[0-9]*" maxLength={12} required
          placeholder="••••••••" className={`${inputClass} text-center font-serif text-3xl tracking-[0.35em]`}
          aria-invalid={!!ver.error} aria-describedby={ver.error ? "code-error" : undefined}
        />
      </Field>
      <Button type="submit" disabled={verifying} className="w-full">{verifying ? "Checking…" : "Continue"}</Button>
      {!req.adminCode && !req.demoCode && (
        <button type="submit" formAction={requestAction} formNoValidate className="mx-auto block min-h-11 text-sm font-medium text-ink underline underline-offset-4">
          Send a new code
        </button>
      )}
    </form>
  );
}
