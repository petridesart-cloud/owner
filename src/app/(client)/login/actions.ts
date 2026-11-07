"use server";
import { alertStudio } from "@/lib/studio-alerts";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/auth";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { dobSchema, nameSchema, phoneSchema } from "@/lib/profile";
import { DEMO_CLIENT_PASSWORD, authUser, isStudioAdmin, landing, onboard, profileFor, sendCode, type SignupDetails } from "@/lib/auth-flow";

const Email = z.string().trim().toLowerCase().email("Please check your email address.");
const Password = z.string().min(8, "Use at least 8 characters.").max(72, "That's too long (72 characters at most).");

/** Ties a sign-up's details to the browser that typed them (httpOnly cookie; only its hash is on the login). */
const SIGNUP_COOKIE = "rf_signup";
const signupKey = (nonce?: string) => (nonce ? createHash("sha256").update(nonce).digest("hex") : undefined);

/** Bind the sign-up waiting for confirmation to this browser (after the password was typed here). */
async function bindSignup(userId: string) {
  const nonce = randomBytes(24).toString("base64url");
  await db().auth.admin.updateUserById(userId, { user_metadata: { signup_key: signupKey(nonce) } });
  await setSignupCookie(nonce);
}
async function setSignupCookie(nonce: string) {
  (await cookies()).set(SIGNUP_COOKIE, nonce, { httpOnly: true, secure: env.siteUrl.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
}

export type AuthState = { ok: boolean; step?: "code"; email?: string; demoCode?: string; error?: string; errors?: Record<string, string> };

/** Sign in with a one-off code we generate (used after a code check, and for the demo accounts). */
async function signInWithCode(email: string, token: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  return error || !data.user ? null : data.user;
}

async function tooMany(email: string) {
  const ip = await clientIp();
  return (await rateLimited("signin", email, 10, 15)) || (await rateLimited("signin_ip", ip, 50, 15));
}

/** Sign in with email + password. The studio team lands in the studio. */
export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get("email"));
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!email.success || !password) return { ok: false, error: "Enter your email and password." };
  if (await tooMany(email.data)) return { ok: false, error: "Too many tries. Please wait 15 minutes, or reset your password." };

  let user: { id: string; email?: string } | null = null;
  let verified = false; // a demo password counts as proof of the email; a real password alone doesn't
  if (env.demoMode && (await isStudioAdmin(email.data))) {
    // Demo: the studio signs in with DEMO_ADMIN_CODE (no emails are sent in the demo).
    if (env.demoAdminCode.length < 8 || password !== env.demoAdminCode) return { ok: false, error: "Email or password isn't right." };
    await db().auth.admin.createUser({ email: email.data, email_confirm: true });
    const link = await db().auth.admin.generateLink({ type: "magiclink", email: email.data });
    user = await signInWithCode(email.data, link.data?.properties?.email_otp ?? "");
    verified = true;
  } else if (env.demoMode && password === DEMO_CLIENT_PASSWORD && email.data.endsWith("@example.com")) {
    // Demo clients (elena@example.com…) share one password, shown on the sign-in page.
    const { data: demo } = await db().from("profiles").select("id").eq("email", email.data).is("deleted_at", null).maybeSingle();
    if (!demo) return { ok: false, error: "Email or password isn't right." };
    await db().auth.admin.createUser({ email: email.data, email_confirm: true });
    const link = await db().auth.admin.generateLink({ type: "magiclink", email: email.data });
    user = await signInWithCode(email.data, link.data?.properties?.email_otp ?? "");
    verified = true;
  } else {
    const existing = await authUser(email.data);
    const supabase = await supabaseServer();
    if (existing && !existing.confirmed && existing.has_password) {
      // Created an account but never confirmed the email: if the password is right, send a fresh code
      // (and keep their sign-up details for this browser). No session before the email is confirmed.
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.data, password });
      if (data.session) await supabase.auth.signOut();
      if (!data.user && error?.code !== "email_not_confirmed") return { ok: false, error: "Email or password isn't right." };
      await bindSignup(existing.id);
      const sent = await sendCode(email.data, "verify_email");
      return sent.ok ? { ok: true, step: "code", email: email.data, demoCode: sent.demoCode } : { ok: false, error: sent.error };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.data, password });
    if (error || !data.user) {
      return {
        ok: false,
        error: existing && !existing.has_password
          ? "This account doesn't have a password yet. Tap “Forgot password?” to set one."
          : "Email or password isn't right.",
      };
    }
    user = data.user;
  }
  if (!user) return { ok: false, error: "We couldn't sign you in. Please try again." };
  const profile = await profileFor(user.id, email.data, { verified });
  if (!profile) {
    // The login isn't linked to their client record yet: a code from the email proves it's them.
    await (await supabaseServer()).auth.signOut();
    return { ok: false, error: "Please confirm it's you: tap “Forgot password?” and we'll email you a code." };
  }
  redirect(landing(profile, next));
}

/** Confirm the email of a new account (or one that wasn't confirmed) with the code we sent. */
export async function confirmEmail(_: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get("email"));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  const next = String(form.get("next") ?? "/");
  if (!email.success || token.length < 6 || token.length > 12) return { ok: false, step: "code", email: email.data, error: "Enter the code from your email." };
  if (await tooMany(email.data)) return { ok: false, step: "code", email: email.data, error: "Too many tries. Please wait 15 minutes, then ask for a new code." };
  const user = await signInWithCode(email.data, token);
  if (!user) return { ok: false, step: "code", email: email.data, error: "That code didn't work or has expired. Check it, or ask for a new one." };

  let profile = await profileFor(user.id, email.data, { verified: true });
  // Details typed when creating the account are kept on the login until the email is confirmed. They're
  // used only in the browser that typed them (A-088): otherwise someone who re-ran sign-up for this email
  // could put their own name, phone and password on it. Without the match, /welcome asks for the details.
  const meta = (user.user_metadata ?? {}) as Partial<SignupDetails> & { signup?: boolean; signup_key?: string };
  const jar = await cookies();
  const sameBrowser = !!meta.signup_key && meta.signup_key === signupKey(jar.get(SIGNUP_COOKIE)?.value);
  jar.delete(SIGNUP_COOKIE);
  if (meta.signup && !sameBrowser) {
    // Not the browser that chose the password: drop it (they can set one with "Forgot password?").
    await db().auth.admin.updateUserById(user.id, { password: randomBytes(32).toString("hex"), user_metadata: { signup: false, signup_key: null } });
  }
  if (profile && meta.signup && sameBrowser && !profile.onboarded_at) {
    try {
      profile = await onboard(profile, email.data, meta as SignupDetails, (await getSettings()).policy_version);
    } catch {
      // Not saved (A-019): they're signed in, and /welcome asks for the details again.
      redirect(landing(profile, next));
    }
    await db().auth.admin.updateUserById(user.id, { user_metadata: { signup: false, signup_key: null } });
    if (profile) await alertStudio("signups", `New client: ${profile.full_name ?? email.data}`, [`${email.data}${profile.phone ? ` · ${profile.phone}` : ""}`, "They've created an account in the app."],
      { path: `/admin/clients/${profile.id}`, dedupeKey: `signup:${profile.id}` });
  }
  redirect(landing(profile, next));
}

/** Ask for a new code (confirming an account). */
export async function resendCode(_: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get("email"));
  if (!email.success) return { ok: false, error: "Enter your email." };
  const sent = await sendCode(email.data, "verify_email");
  return sent.ok ? { ok: true, step: "code", email: email.data, demoCode: sent.demoCode } : { ok: false, step: "code", email: email.data, error: sent.error };
}

/** Forgot password, step 1: email a code. Says the same whether or not there's an account. */
export async function requestReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get("email"));
  if (!email.success) return { ok: false, error: "Enter the email you signed up with." };
  if (env.demoMode && (await isStudioAdmin(email.data))) return { ok: false, error: "Demo: the studio signs in with the studio password." };
  let existing = await authUser(email.data);
  if (!existing) {
    // A client the studio added (or imported), or a studio email from ADMIN_EMAILS: create their login now.
    const { data: known } = await db().from("profiles").select("id").eq("email", email.data).is("deleted_at", null).maybeSingle();
    if (known || (await isStudioAdmin(email.data))) {
      await db().auth.admin.createUser({ email: email.data, email_confirm: false });
      existing = await authUser(email.data);
    }
  }
  if (!existing) return { ok: true, step: "code", email: email.data }; // don't reveal who has an account
  const sent = await sendCode(email.data, "reset_code");
  return sent.ok ? { ok: true, step: "code", email: email.data, demoCode: sent.demoCode } : { ok: false, error: sent.error };
}

/** Forgot password, step 2: the code plus a new password; signs them in. */
export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get("email"));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  const pw = Password.safeParse(String(form.get("password") ?? ""));
  const next = String(form.get("next") ?? "/");
  const back = { step: "code" as const, email: email.data };
  if (!email.success || token.length < 6) return { ok: false, ...back, error: "Enter the code from your email." };
  if (!pw.success) return { ok: false, ...back, errors: { password: pw.error.issues[0].message } };
  if (pw.data !== String(form.get("confirm") ?? "")) return { ok: false, ...back, errors: { confirm: "The passwords don't match." } };
  if (await tooMany(email.data)) return { ok: false, ...back, error: "Too many tries. Please wait 15 minutes, then ask for a new code." };
  const user = await signInWithCode(email.data, token);
  if (!user) return { ok: false, ...back, error: "That code didn't work or has expired. Check it, or ask for a new one." };
  const { error: saveError } = await db().auth.admin.updateUserById(user.id, { password: pw.data, user_metadata: { signup: false, signup_key: null } });
  // A-019: never say it's changed when it isn't (the code has been used, so they ask for a new one).
  if (saveError) {
    console.error("password update failed", saveError);
    return { ok: false, email: email.data, error: "Your new password couldn't be saved. Please ask for a new code and try again." };
  }
  // Changing the password ends existing sessions, so sign in again with the new one.
  await (await supabaseServer()).auth.signInWithPassword({ email: email.data, password: pw.data });
  const profile = await profileFor(user.id, email.data, { verified: true });
  redirect(landing(profile, next));
}

const Signup = z.object({
  first_name: nameSchema, last_name: nameSchema, date_of_birth: dobSchema, email: Email, phone: phoneSchema, password: Password,
});

/** Create an account: details + password, then a one-time code confirms the email. */
export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Signup.safeParse({
    first_name: form.get("first_name"), last_name: form.get("last_name"), date_of_birth: form.get("date_of_birth") ?? "",
    email: form.get("email"), phone: form.get("phone"), password: String(form.get("password") ?? ""),
  });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
  if (String(form.get("password") ?? "") !== String(form.get("confirm") ?? "")) errors.confirm ??= "The passwords don't match.";
  if (form.get("policy") !== "on") errors.policy = "Please accept the Studio Rules, policies, Terms and Health & Safety acknowledgement.";
  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };
  const d = parsed.data;
  if (await tooMany(d.email)) return { ok: false, error: "Too many tries. Please wait 15 minutes and try again." };

  const nonce = randomBytes(24).toString("base64url");
  const details: SignupDetails & { signup: true; signup_key: string } = {
    signup: true, signup_key: signupKey(nonce)!, first_name: d.first_name, last_name: d.last_name, date_of_birth: d.date_of_birth, phone: d.phone,
    photo_consent: String(form.get("photo_consent") ?? ""), marketing_email: form.get("marketing_email") === "on",
  };
  const existing = await authUser(d.email);
  if (existing?.confirmed) {
    // Never set a password on a confirmed account before the email is proven: that's what "Forgot password" is for.
    return { ok: false, errors: { email: existing.has_password
      ? "There's already an account with this email. Sign in, or use “Forgot password?”."
      : "You already have an account with this email. Use “Forgot password?” on the sign-in page to set your password." } };
  }
  if (existing) {
    // A sign-up that was never confirmed: start again; they prove the email with the code.
    await db().auth.admin.updateUserById(existing.id, { password: d.password, user_metadata: details });
  } else {
    const created = await db().auth.admin.createUser({ email: d.email, password: d.password, email_confirm: false, user_metadata: details });
    if (created.error) {
      console.error("createUser", created.error);
      return { ok: false, error: "We couldn't create your account. Please try again." };
    }
  }
  await setSignupCookie(nonce);
  const sent = await sendCode(d.email, "verify_email");
  return sent.ok ? { ok: true, step: "code", email: d.email, demoCode: sent.demoCode } : { ok: false, error: sent.error };
}

