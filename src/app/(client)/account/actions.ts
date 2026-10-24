"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { getSettings, requireViewer } from "@/lib/auth";
import { PHOTO_CONSENT, dobSchema, fullName, nameSchema, phoneSchema, saveHealth, saveParq, type PhotoConsent } from "@/lib/profile";
import { readParq } from "@/lib/parq";

export type SaveState = { ok: boolean; message?: string; error?: string };

export async function saveProfile(_: SaveState, form: FormData): Promise<SaveState> {
  const viewer = await requireViewer("/account");
  const settings = await getSettings();
  const parsed = z.object({
    first_name: nameSchema, last_name: nameSchema, phone: phoneSchema, date_of_birth: dobSchema,
    goal: z.string().trim().max(200).optional(),
    emergency_contact_name: z.string().trim().max(80).optional(),
    emergency_contact_phone: phoneSchema.optional().or(z.literal("")),
  }).safeParse({
    first_name: form.get("first_name"), last_name: form.get("last_name"), phone: form.get("phone"), date_of_birth: form.get("date_of_birth") ?? "",
    goal: form.get("goal") ?? "", emergency_contact_name: form.get("emergency_contact_name") ?? "", emergency_contact_phone: form.get("emergency_contact_phone") ?? "",
  });
  if (!parsed.success) return { ok: false, error: `Please check: ${[...new Set(parsed.error.issues.map((i) => LABEL[String(i.path[0])] ?? String(i.path[0])))].join(", ")}.` };

  const p = viewer.profile;
  const d = parsed.data;
  const me = form.get("marketing_email") === "on";
  const reminders = form.get("reminder_emails") === "on";
  const photos = String(form.get("photo_consent") ?? "");
  const photoConsent = photos in PHOTO_CONSENT ? (photos as PhotoConsent) : p.photo_consent;
  await db().from("profiles").update({
    first_name: d.first_name, last_name: d.last_name, full_name: fullName(d.first_name, d.last_name), phone: d.phone,
    date_of_birth: d.date_of_birth, goal: d.goal || null,
    emergency_contact_name: d.emergency_contact_name || null, emergency_contact_phone: d.emergency_contact_phone || null,
    photo_consent: photoConsent, marketing_email: me, reminder_emails: reminders,
  }).eq("id", p.id);
  const changes: { profile_id: string; type: "marketing_email" | "photos"; granted: boolean; version: string }[] = [];
  if (me !== p.marketing_email) changes.push({ profile_id: p.id, type: "marketing_email", granted: me, version: settings.policy_version });
  if (photoConsent && photoConsent !== p.photo_consent) changes.push({ profile_id: p.id, type: "photos", granted: photoConsent !== "none", version: `${settings.policy_version}:${photoConsent}` });
  if (changes.length) await db().from("consents").insert(changes);
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

const LABEL: Record<string, string> = {
  first_name: "first name", last_name: "surname", phone: "mobile number", date_of_birth: "date of birth", emergency_contact_phone: "emergency contact phone",
};

export async function saveHealthInfo(_: SaveState, form: FormData): Promise<SaveState> {
  const viewer = await requireViewer("/account");
  const settings = await getSettings();
  const res = await saveHealth(viewer.profile.id, { injuries: String(form.get("injuries") ?? ""), medication: String(form.get("medication") ?? "") },
    form.get("health_consent") === "on", settings.policy_version);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/account");
  return { ok: true, message: res.cleared ? "Health information deleted and consent withdrawn." : "Saved. Only your instructor can see this." };
}

export async function saveParqAnswers(_: SaveState, form: FormData): Promise<SaveState> {
  const viewer = await requireViewer("/account");
  const settings = await getSettings();
  const parq = readParq(form);
  if (!parq.ok) return { ok: false, error: `Please answer all the health questions (${parq.missing} left).` };
  if (parq.yes.length && form.get("parq_ack") !== "on") return { ok: false, error: "Please confirm you'll check with your doctor and tell your instructor." };
  await saveParq(viewer.profile.id, parq.yes, form.get("health_consent") === "on", settings.policy_version);
  revalidatePath("/account");
  return { ok: true, message: "Thank you, saved." };
}

export async function signOutAction() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

/** Right to erasure. Keeps only minimal, anonymised booking/payment records for accounting. */
export async function deleteAccount(form: FormData) {
  const viewer = await requireViewer("/account");
  if (String(form.get("confirm")).trim().toUpperCase() !== "DELETE") redirect("/account?delete=confirm");
  const { data: uid } = await db().rpc("erase_profile", { p_profile: viewer.profile.id });
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  if (uid) await db().auth.admin.deleteUser(uid as string);
  redirect("/?deleted=1");
}
