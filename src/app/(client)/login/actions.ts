"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { notify } from "@/lib/notifications";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const Email = z.string().trim().toLowerCase().email();

export type RequestState = { ok: boolean; email?: string; error?: string; demoCode?: string };

/**
 * Step 1: email a 6-digit code. We generate the code with Supabase Auth's admin
 * API and deliver it ourselves (Resend), so links never have to open in
 * Instagram's in-app browser. Rate limited per email and per IP.
 */
export async function requestCode(_: RequestState, form: FormData): Promise<RequestState> {
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { ok: false, error: "Please enter a valid email address." };
  const email = parsed.data;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [byEmail, byIp] = await Promise.all([
    db().from("otp_requests").select("id", { count: "exact", head: true }).eq("email_hash", sha(email)).gte("created_at", since),
    db().from("otp_requests").select("id", { count: "exact", head: true }).eq("ip_hash", sha(ip)).gte("created_at", since),
  ]);
  if ((byEmail.count ?? 0) >= 5 || (byIp.count ?? 0) >= 20) {
    return { ok: false, error: "Too many codes requested. Please wait 15 minutes and try again." };
  }
  await db().from("otp_requests").insert({ email_hash: sha(email), ip_hash: sha(ip) });

  // Create the auth user on first visit (the DB trigger links any existing client record).
  const created = await db().auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message)) {
    console.error("createUser", created.error);
    return { ok: false, error: "We couldn't start sign-in. Please try again." };
  }
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    console.error("generateLink", error);
    return { ok: false, error: "We couldn't create a code. Please try again." };
  }

  const { data: profile } = await db().from("profiles").select("id").ilike("email", email).maybeSingle();
  await notify({ profileId: profile?.id, email }, "login_code", { code });

  return { ok: true, email, demoCode: env.demoMode ? code : undefined };
}

export type VerifyState = { ok: boolean; error?: string; redirect?: string };

/** Step 2: verify the code and start a session (httpOnly cookies). */
export async function verifyCode(_: VerifyState, form: FormData): Promise<VerifyState> {
  const email = Email.safeParse(form.get("email"));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  const next = safeNext(String(form.get("next") ?? "/"));
  if (!email.success || token.length < 6) return { ok: false, error: "Enter the 6-digit code from your email." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token, type: "email" });
  if (error || !data.user) return { ok: false, error: "That code didn't work or has expired. Check it, or request a new one." };

  const { data: profile } = await db().from("profiles").select("id, role, onboarded_at").eq("user_id", data.user.id).maybeSingle();
  if (profile && env.adminEmails.includes(email.data) && profile.role !== "admin") {
    await db().from("profiles").update({ role: "admin" }).eq("id", profile.id);
    profile.role = "admin";
  }
  if (profile?.role === "admin" && next === "/") return { ok: true, redirect: "/admin" };
  if (!profile?.onboarded_at && profile?.role !== "admin") return { ok: true, redirect: `/welcome?next=${encodeURIComponent(next)}` };
  return { ok: true, redirect: next };
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
}

function safeNext(n: string) {
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}
