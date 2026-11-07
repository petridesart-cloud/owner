import "server-only";
import { redact } from "@/lib/log-safe";
import { env } from "@/lib/env";
import { PROVIDER_TIMEOUT_MS } from "./timeout";

// Resend (https://resend.com). Swap this file to change email provider.
export async function sendEmail(to: string, subject: string, html: string, replyTo?: string | null): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), // a hanging provider must not hold up a tap or the tick (A-017)
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${redact(await res.text())}`);
  return ((await res.json()) as { id: string }).id;
}
