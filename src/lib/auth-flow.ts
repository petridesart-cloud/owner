import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/supabase/admin";
import { emailLive, env } from "@/lib/env";
import { notify } from "@/lib/notifications";
import { ensureProfile, type Profile } from "@/lib/auth";
import { normEmail } from "@/lib/request-keys";
import { safeNext } from "@/lib/safe-next";
import { fullName, PHOTO_CONSENT, type PhotoConsent } from "@/lib/profile";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Demo only: every demo client (…@example.com) signs in with this password, shown on the sign-in page. */
export const DEMO_CLIENT_PASSWORD = "reform-demo";

/** Admins: emails in ADMIN_EMAILS (bootstrap), anyone on the Studio team, and pending Studio-team invites. */
export async function isStudioAdmin(raw: string) {
  const email = normEmail(raw);
  if (env.adminEmails.includes(email)) return true;
  const [{ data: admin }, { data: invite }] = await Promise.all([
    db().from("profiles").select("id").eq("email", email).eq("role", "admin").is("deleted_at", null).maybeSingle(),
    db().from("team_invites").select("email").eq("email", email).maybeSingle(),
  ]);
  return !!admin || !!invite;
}

export async function authUser(email: string) {
  const { data } = await db().rpc("auth_user_by_email", { p_email: email });
  return (data ?? [])[0] as { id: string; confirmed: boolean; has_password: boolean } | undefined;
}

/** Codes by email: 5 per email and 20 per IP every 15 minutes. */
async function codeLimited(email: string) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [byEmail, byIp] = await Promise.all([
    db().from("otp_requests").select("id", { count: "exact", head: true }).eq("email_hash", sha(email)).gte("created_at", since),
    db().from("otp_requests").select("id", { count: "exact", head: true }).eq("ip_hash", sha(ip)).gte("created_at", since),
  ]);
  if ((byEmail.count ?? 0) >= 5 || (byIp.count ?? 0) >= 20) return true;
  await db().from("otp_requests").insert({ email_hash: sha(email), ip_hash: sha(ip) });
  return false;
}

export type CodeResult = { ok: true; demoCode?: string } | { ok: false; error: string };

/**
 * Email a 6-digit code (confirming a new account, or resetting a password). Generated with Supabase
 * Auth's admin API and delivered by our own email, so nothing has to open a link in Instagram's browser.
 * Demo mode shows client codes on screen (never for studio emails).
 */
export async function sendCode(email: string, template: "verify_email" | "reset_code"): Promise<CodeResult> {
  if (!env.demoMode && !emailLive()) return { ok: false, error: "Email isn't switched on yet. Please message the studio on Instagram." };
  if (await codeLimited(email)) return { ok: false, error: "Too many codes requested. Please wait 15 minutes and try again." };
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    console.error("generateLink", error);
    return { ok: false, error: "We couldn't create a code. Please try again." };
  }
  const { data: profile } = await db().from("profiles").select("id").eq("email", normEmail(email)).is("deleted_at", null).maybeSingle();
  const sent = await notify({ profileId: profile?.id, email }, template, { code });
  if (sent.email === "failed") return { ok: false, error: "We couldn't send the email just now. Please try again in a minute." };
  return { ok: true, demoCode: env.demoMode && !(await isStudioAdmin(email)) ? code : undefined };
}

/**
 * Make sure the login and profile exist and are linked. `verified` means this sign-in just proved the
 * email (a code from the email, or the demo passwords): only then is an unlinked client record linked,
 * and admin access granted to ADMIN_EMAILS (bootstrap) and pending Studio-team invites. A password
 * sign-in alone never grants either, so a login created outside the app can't claim them.
 */
export async function profileFor(userId: string, raw: string, opts: { verified?: boolean } = {}): Promise<Profile | null> {
  const email = normEmail(raw);
  const profile = await ensureProfile(userId, email, { link: opts.verified });
  if (!profile || !opts.verified || profile.role === "admin") return profile;
  const { data: invite } = await db().from("team_invites").select("email, full_name").eq("email", email).maybeSingle();
  if (env.adminEmails.includes(email) || invite) {
    const { error } = await db().from("profiles").update({ role: "admin", ...(invite?.full_name && !profile.full_name ? { full_name: invite.full_name } : {}) }).eq("id", profile.id);
    if (!error) {
      profile.role = "admin";
      if (invite) await db().from("team_invites").delete().eq("email", email);
    }
  }
  return profile;
}

/** Where to go after signing in: the studio for the team, otherwise where they were heading. */
export function landing(profile: Profile | null, rawNext: string) {
  const next = safeNext(rawNext);
  if (profile?.role === "admin") return next.startsWith("/admin") ? next : "/admin";
  if (!profile?.onboarded_at) return `/welcome?next=${encodeURIComponent(next)}`;
  if (!profile.parq_completed_at) return `/health?next=${encodeURIComponent(next)}`;
  return next;
}

export type SignupDetails = {
  first_name: string; last_name: string; date_of_birth: string; phone: string;
  photo_consent: string; marketing_email: boolean;
};

/** A new account's details, saved once the email is confirmed (with the consents she needs). */
export async function onboard(profile: Profile, email: string, d: SignupDetails, version: string) {
  const photo: PhotoConsent | null = d.photo_consent in PHOTO_CONSENT ? (d.photo_consent as PhotoConsent) : null;
  await db().from("profiles").update({
    first_name: d.first_name, last_name: d.last_name, full_name: fullName(d.first_name, d.last_name),
    phone: d.phone, date_of_birth: d.date_of_birth, email: email.toLowerCase(), photo_consent: photo,
    marketing_email: d.marketing_email, marketing_sms: false, onboarded_at: new Date().toISOString(),
  }).eq("id", profile.id);
  const rows: { profile_id: string; type: "policy" | "terms" | "fitness_declaration" | "marketing_email" | "photos"; granted: boolean; version: string }[] = [
    { profile_id: profile.id, type: "policy", granted: true, version },
    { profile_id: profile.id, type: "terms", granted: true, version },
    { profile_id: profile.id, type: "fitness_declaration", granted: true, version },
    { profile_id: profile.id, type: "marketing_email", granted: d.marketing_email, version },
  ];
  if (photo) rows.push({ profile_id: profile.id, type: "photos", granted: photo !== "none", version: `${version}:${photo}` });
  await db().from("consents").insert(rows);
  return { ...profile, onboarded_at: new Date().toISOString() };
}
