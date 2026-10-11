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
export async function notify(to: Recipient, template: TemplateName, data: TemplateData, opts: Opts = {}) {
  const r = render(template, data);
  const jobs: Promise<void>[] = [];
  if (to.email) jobs.push(deliver("email", to, template, r.subject, emailHtml(r), opts));
  if (opts.sms && to.phone) jobs.push(deliver("sms", to, template, null, r.sms, opts));
  await Promise.allSettled(jobs);
}

async function deliver(
  channel: "email" | "sms", to: Recipient, template: string, subject: string | null, body: string, opts: Opts,
) {
  const recipient = (channel === "email" ? to.email : to.phone)!;
  const live = channel === "email" ? emailLive() : smsLive();
  const { data: row, error } = await db()
    .from("notifications")
    .insert({
      profile_id: to.profileId ?? null, channel, template, recipient, subject, body,
      status: "logged", dedupe_key: opts.dedupeKey ? `${opts.dedupeKey}:${channel}` : null,
      booking_id: opts.bookingId ?? null, session_id: opts.sessionId ?? null,
    })
    .select("id")
    .single();
  if (error) return; // duplicate dedupe key = already sent
  if (!live) return;
  try {
    const ref = channel === "email" ? await sendEmail(recipient, subject!, body) : await sendSms(recipient, body);
    await db().from("notifications").update({ status: "sent", provider_ref: ref }).eq("id", row.id);
  } catch (e) {
    await db().from("notifications").update({ status: "failed", error: String(e).slice(0, 500) }).eq("id", row.id);
  }
}

export const notificationsMode = () => (env.demoMode || !env.resendKey ? "outbox" : "live");
