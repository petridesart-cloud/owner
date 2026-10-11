"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { getSettings, requireViewer } from "@/lib/auth";

export type WelcomeState = { ok: boolean; errors?: Record<string, string>; redirect?: string };

const Schema = z.object({
  full_name: z.string().trim().min(2, "Please tell us your name.").max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Please enter a valid phone number, e.g. +357 99 123456."),
  health_note: z.string().trim().max(1000).optional(),
});

export async function completeWelcome(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const viewer = await requireViewer();
  const settings = await getSettings();
  const parsed = Schema.safeParse({
    full_name: form.get("full_name"), phone: form.get("phone"), health_note: form.get("health_note") || undefined,
  });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] = i.message;

  const policy = form.get("policy") === "on";
  const fitness = form.get("fitness") === "on";
  const healthConsent = form.get("health_consent") === "on";
  const note = parsed.success ? parsed.data.health_note : undefined;
  if (!policy) errors.policy = "Please accept the Studio Rules and Terms to book.";
  if (!fitness) errors.fitness = "Please confirm the health declaration to book.";
  if (note && !healthConsent) errors.health_consent = "To store your health note we need your explicit consent. Or leave the note empty.";
  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };

  const p = viewer.profile;
  const marketingEmail = form.get("marketing_email") === "on";
  const marketingSms = form.get("marketing_sms") === "on";
  await db().from("profiles").update({
    full_name: parsed.data.full_name, phone: parsed.data.phone, email: viewer.email.toLowerCase(),
    marketing_email: marketingEmail, marketing_sms: marketingSms, onboarded_at: new Date().toISOString(),
  }).eq("id", p.id);

  const v = settings.policy_version;
  const rows: { profile_id: string; type: "policy" | "terms" | "fitness_declaration" | "health_data" | "marketing_email" | "marketing_sms"; granted: boolean; version: string }[] = [
    { profile_id: p.id, type: "policy", granted: true, version: v },
    { profile_id: p.id, type: "terms", granted: true, version: v },
    { profile_id: p.id, type: "fitness_declaration", granted: true, version: v },
    { profile_id: p.id, type: "marketing_email", granted: marketingEmail, version: v },
    { profile_id: p.id, type: "marketing_sms", granted: marketingSms, version: v },
  ];
  if (note) {
    rows.push({ profile_id: p.id, type: "health_data", granted: true, version: v });
    await db().from("health_notes").upsert({ profile_id: p.id, note, consent_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  await db().from("consents").insert(rows);

  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
