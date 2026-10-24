"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { getSettings, requireViewer } from "@/lib/auth";
import { PHOTO_CONSENT, dobSchema, fullName, nameSchema, phoneSchema, saveHealth, type PhotoConsent } from "@/lib/profile";

export type WelcomeState = { ok: boolean; errors?: Record<string, string>; redirect?: string };

const Schema = z.object({ first_name: nameSchema, last_name: nameSchema, phone: phoneSchema, date_of_birth: dobSchema });

export async function completeWelcome(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const viewer = await requireViewer();
  const settings = await getSettings();
  const parsed = Schema.safeParse({
    first_name: form.get("first_name"), last_name: form.get("last_name"), phone: form.get("phone"), date_of_birth: form.get("date_of_birth") ?? "",
  });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;

  const policy = form.get("policy") === "on";
  const fitness = form.get("fitness") === "on";
  const healthConsent = form.get("health_consent") === "on";
  const injuries = String(form.get("injuries") ?? "").trim();
  const medication = String(form.get("medication") ?? "").trim();
  const photos = String(form.get("photo_consent") ?? "");
  if (!policy) errors.policy = "Please accept the Studio Rules and Terms to book.";
  if (!fitness) errors.fitness = "Please confirm the health declaration to book.";
  if ((injuries || medication) && !healthConsent) errors.health_consent = "To store health information we need your explicit consent. Or leave those boxes empty.";
  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };

  const p = viewer.profile;
  const marketingEmail = form.get("marketing_email") === "on";
  const photoConsent: PhotoConsent | null = photos in PHOTO_CONSENT ? (photos as PhotoConsent) : null;
  await db().from("profiles").update({
    first_name: parsed.data.first_name, last_name: parsed.data.last_name, full_name: fullName(parsed.data.first_name, parsed.data.last_name),
    phone: parsed.data.phone, date_of_birth: parsed.data.date_of_birth, email: viewer.email.toLowerCase(), photo_consent: photoConsent,
    marketing_email: marketingEmail, marketing_sms: false, onboarded_at: new Date().toISOString(),
  }).eq("id", p.id);

  const v = settings.policy_version;
  const rows: { profile_id: string; type: "policy" | "terms" | "fitness_declaration" | "marketing_email" | "marketing_sms" | "photos"; granted: boolean; version: string }[] = [
    { profile_id: p.id, type: "policy", granted: true, version: v },
    { profile_id: p.id, type: "terms", granted: true, version: v },
    { profile_id: p.id, type: "fitness_declaration", granted: true, version: v },
    { profile_id: p.id, type: "marketing_email", granted: marketingEmail, version: v },
  ];
  if (photoConsent) rows.push({ profile_id: p.id, type: "photos", granted: photoConsent !== "none", version: `${v}:${photoConsent}` });
  await db().from("consents").insert(rows);
  if (injuries || medication) await saveHealth(p.id, { injuries, medication }, healthConsent, v);

  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
