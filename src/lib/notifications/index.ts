import "server-only";
import { safeError } from "@/lib/log-safe";
import { after } from "next/server";
import { db } from "@/lib/supabase/admin";
import { emailLive, smsLive, env } from "@/lib/env";
import { emailHtml, render, type TemplateData, type TemplateName } from "./templates";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { getSettings } from "@/lib/auth";

type Recipient = { profileId?: string | null; email?: string | null; phone?: string | null };
/** `aboutProfileId`: the client a studio alert is about, so erasing them also erases it (A-010). */
type Opts = { sms?: boolean; dedupeKey?: string; bookingId?: string; sessionId?: string; aboutProfileId?: string };

/**
 * Transactional notification. Every message is written to the Outbox table; it is
 * only sent for real when the provider is configured and demo mode is off.
 * Marketing messages must never go through here.
 *
 * A failed send stays in the Outbox as `failed` with a next attempt time; the tick resends it with
 * backoff (up to 5 tries) unless it's too late to matter, and a later notify() with the same dedupe
 * key takes the failed row over (A-015). "duplicate" means only "already sent / in flight" (A-016).
 */
export type Delivery = "sent" | "logged" | "failed" | "duplicate";

/** Did the message really go out (or into the demo Outbox)? A login code must never be claimed as sent otherwise. */
export const delivered = (d?: Delivery) => d === "sent" || d === "logged";

export const MAX_ATTEMPTS = 5;
const CODE_TEMPLATES = new Set(["login_code", "verify_email", "reset_code"]);
/** 5, 10, 20, 40 minutes after the 1st…4th failed try; none after the 5th. */
export const nextAttemptAt = (attempts: number, now = Date.now()) =>
  attempts >= MAX_ATTEMPTS ? null : new Date(now + 5 * 60_000 * 2 ** Math.max(attempts - 1, 0)).toISOString();

export async function notify(to: Recipient, template: TemplateName, data: TemplateData, opts: Opts = {}): Promise<{ email?: Delivery; sms?: Delivery }> {
  const r = render(template, data);
  const [email, sms] = await Promise.all([
    to.email ? deliver("email", to, template, r.subject, emailHtml(r), opts).catch(fail(template)) : undefined,
    opts.sms && to.phone ? deliver("sms", to, template, null, r.sms, opts).catch(fail(template)) : undefined,
  ]);
  return { email, sms };
}
const fail = (template: string) => (e: unknown) => { console.error(`notify ${template}`, safeError(e)); return "failed" as const; };

/**
 * Run post-commit messages after the response is sent (`after()`), so a slow email provider never
 * holds up a tap. Dedupe keys keep any retry safe. Outside a request (scripts, tests) it just runs.
 */
export function later(label: string, fn: () => Promise<unknown>) {
  const run = () => fn().catch((e) => console.error(label, safeError(e)));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Run `fn` over `items`, at most `n` at a time. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

type Claimed = { id: string; attempts: number };

async function deliver(
  channel: "email" | "sms", to: Recipient, template: string, subject: string | null, body: string, opts: Opts,
): Promise<Delivery> {
  const recipient = (channel === "email" ? to.email : to.phone)!;
  const live = channel === "email" ? emailLive() : smsLive();
  // Login codes are never stored in the Outbox once real email is on (anyone reading it could sign in as the client).
  const stored = CODE_TEMPLATES.has(template) && live ? "[code; not stored]" : body;
  const key = opts.dedupeKey ? `${opts.dedupeKey}:${channel}` : null;
  const { data, error } = await db()
    .from("notifications")
    .insert({
      profile_id: to.profileId ?? null, channel, template, recipient, subject, body: stored,
      status: "logged", attempts: live ? 1 : 0, dedupe_key: key,
      booking_id: opts.bookingId ?? null, session_id: opts.sessionId ?? null, about_profile_id: opts.aboutProfileId ?? to.profileId ?? null,
    })
    .select("id, attempts")
    .single();
  let row: Claimed | null = data;
  if (error) {
    if (error.code === "23505" && key && error.message.includes("notifications_dedupe_key_key")) {
      if (!live) return "duplicate";
      // Already there: sent or in flight ("duplicate"), or failed and due again (take it over).
      const { data: claimed, error: e2 } = await db().rpc("notification_reclaim", { p_key: key, p_subject: subject as string, p_body: stored });
      if (e2) { console.error(`notify ${template}: reclaim`, e2); return "failed"; }
      if (!claimed?.length) return "duplicate";
      row = claimed[0];
    } else {
      console.error(`notify ${template}: outbox insert`, error);
      // Without an Outbox row there's nothing to retry later. A message without a dedupe key (login
      // codes, confirmations) is still worth one try now; one with a key would risk a double send.
      if (!live || key) return "failed";
      row = null;
    }
  }
  if (!live) return "logged";
  return send({ id: row?.id ?? null, attempts: row?.attempts ?? 1, channel, recipient, subject, body, template });
}

type Sendable = { id: string | null; attempts: number; channel: "email" | "sms"; recipient: string; subject: string | null; body: string; template: string };

async function send(n: Sendable): Promise<Delivery> {
  let ref: string;
  try {
    ref = n.channel === "email" ? await sendEmail(n.recipient, n.subject ?? "", n.body, await replyTo()) : await sendSms(n.recipient, n.body);
  } catch (e) {
    console.error(`notify ${n.template} via ${n.channel} failed`, e);
    if (n.id) {
      const { error } = await db().from("notifications")
        .update({ status: "failed", error: String(e).slice(0, 500), next_attempt_at: nextAttemptAt(n.attempts) }).eq("id", n.id);
      if (error) console.error(`notify ${n.template}: marking failed`, error); // stays "logged": never resent
    }
    return "failed";
  }
  if (n.id) {
    // The message went out: record it, and never let the row look failed (a resend would double it).
    for (let i = 0; i < 2; i++) {
      const { error } = await db().from("notifications").update({ status: "sent", provider_ref: ref, error: null, next_attempt_at: null }).eq("id", n.id);
      if (!error) break;
      console.error(`notify ${n.template}: marking sent`, error);
    }
  }
  return "sent";
}

/**
 * Resend failed messages that are due (the tick), or one message now (Outbox "Send again", `id`).
 * Rows about a class that has started, or an offer that's closed, are given up in SQL instead.
 */
export async function retryFailed(opts: { id?: string; limit?: number } = {}): Promise<{ sent: number; failed: number }> {
  const { data, error } = await db().rpc("notification_retry_claim", { p_limit: opts.limit ?? 20, ...(opts.id ? { p_id: opts.id } : {}) });
  if (error) throw error;
  let sent = 0, failed = 0;
  await pool(data ?? [], 5, async (n) => {
    const live = n.channel === "email" ? emailLive() : smsLive();
    if (!live) {
      // Nothing can be sent here (demo / no provider): put it back as it was.
      await db().from("notifications").update({ status: "failed", attempts: n.attempts - 1, next_attempt_at: nextAttemptAt(n.attempts - 1) }).eq("id", n.id);
      failed++;
      return;
    }
    const r = await send({ id: n.id, attempts: n.attempts, channel: n.channel, recipient: n.recipient, subject: n.subject, body: n.body, template: n.template });
    if (r === "sent") sent++; else failed++;
  });
  return { sent, failed };
}

/** Replies go to her real inbox: EMAIL_REPLY_TO, else the contact email in Settings (if filled in). */
async function replyTo() {
  if (env.emailReplyTo) return env.emailReplyTo;
  const contact = (await getSettings()).contact_email;
  return /@/.test(contact) && !/example\.(com|org)/i.test(contact) ? contact : null;
}

/** Is the From address on a real, verifiable domain (not a placeholder)? */
export const emailFromOk = () => !/example\.com|resend\.dev|localhost/i.test(env.emailFrom);

export const notificationsMode = () => (env.demoMode || !env.resendKey ? "outbox" : "live");
