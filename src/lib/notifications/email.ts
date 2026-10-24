import "server-only";
import { env } from "@/lib/env";

// Resend (https://resend.com). Swap this file to change email provider.
export async function sendEmail(to: string, subject: string, html: string, replyTo?: string | null): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}
