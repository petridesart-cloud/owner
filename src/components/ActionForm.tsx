"use client";
import { useActionState, type ReactNode } from "react";
import { Button, Notice } from "./ui";
import type { ActionResult } from "@/lib/errors";

/** Form bound to a server action returning ActionResult; shows success/error inline. */
export function ActionForm({
  action, children, submit, variant = "primary", className = "space-y-4", confirm,
}: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  children?: ReactNode; submit: string; variant?: "primary" | "soft" | "ghost" | "danger"; className?: string; confirm?: string;
}) {
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, { ok: true });
  return (
    <form action={run} className={className} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {children}
      {!state.ok && <Notice tone="error">{state.error}</Notice>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      <Button type="submit" variant={variant} disabled={pending} className="w-full">{pending ? "Working…" : submit}</Button>
    </form>
  );
}
