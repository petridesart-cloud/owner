import "server-only";
import { db } from "@/lib/supabase/admin";
import { emailLive, smsLive, env } from "@/lib/env";
import { emailHtml, render, type TemplateData, type TemplateName } from "./templates";
import { sendEmail } from "./email";
import { sendSms } from "./sms";

type Recipient = { profileId?: string | null; email?: string | null; phone?: string | null };
type Opts = { sms?: boolean; dedupeKey?: string; bookingId?: string; sessionId?: string };

/**
 * Transactional notification. Every message is written to the Outbox table; it is
 * only sent for real when the provider is configured and demo mode is off.
 * Marketing messages must never go through here.
 */
export type Delivery = "sent" | "logged" | "failed" | "duplicate";

export async function notify(to: Recipient, template: TemplateName, data: TemplateData, opts: Opts = {}): Promise<{ email?: Delivery; sms?: Delivery }> {
  const r = render(template, data);
  const [email, sms] = await Promise.all([
    to.email ? deliver("email", to, template, r.subject, emailHtml(r), opts).catch(() => "failed" as const) : undefined,
    opts.sms && to.phone ? deliver("sms", to, template, null, r.sms, opts).catch(() => "failed" as const) : undefined,
  ]);
  return { email, sms };
}

async function deliver(
  channel: "email" | "sms", to: Recipient, template: string, subject: string | null, body: string, opts: Opts,
): Promise<Delivery> {
  const recipient = (channel === "email" ? to.email : to.phone)!;
  const live = channel === "email" ? emailLive() : smsLive();
  const { data: row, error } = await db()
    .from("notifications")
    .insert({
      // Login codes are never stored in the Outbox once real email is on (anyone reading it could sign in as the client).
      profile_id: to.profileId ?? null, channel, template, recipient, subject,
      body: template === "login_code" && live ? "[sign-in code; not stored]" : body,
      status: "logged", dedupe_key: opts.dedupeKey ? `${opts.dedupeKey}:${channel}` : null,
      booking_id: opts.bookingId ?? null, session_id: opts.sessionId ?? null,
    })
    .select("id")
    .single();
  if (error) return "duplicate"; // duplicate dedupe key = already sent
  if (!live) return "logged";
  try {
    const ref = channel === "email" ? await sendEmail(recipient, subject!, body) : await sendSms(recipient, body);
    await db().from("notifications").update({ status: "sent", provider_ref: ref }).eq("id", row.id);
    return "sent";
  } catch (e) {
    console.error(`notify ${template} via ${channel} failed`, e);
    await db().from("notifications").update({ status: "failed", error: String(e).slice(0, 500) }).eq("id", row.id);
    return "failed";
  }
}

/** Is the From address on a real, verifiable domain (not a placeholder)? */
export const emailFromOk = () => !/example\.com|resend\.dev|localhost/i.test(env.emailFrom);

export const notificationsMode = () => (env.demoMode || !env.resendKey ? "outbox" : "live");
