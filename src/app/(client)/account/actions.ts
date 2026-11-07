"use server";
import { alertStudio } from "@/lib/studio-alerts";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { getSettings, requireViewer } from "@/lib/auth";
import { PHOTO_CONSENT, dobSchema, fullName, nameSchema, phoneSchema, type PhotoConsent } from "@/lib/profile";

export type SaveState = { ok: boolean; message?: string; error?: string };

export async function saveProfile(_: SaveState, form: FormData): Promise<SaveState> {
  const viewer = await requireViewer("/account");
  const settings = await getSettings();
  const parsed = z.object({
    first_name: nameSchema, last_name: nameSchema, phone: phoneSchema, date_of_birth: dobSchema,
    goal: z.string().trim().max(200).optional(),
    emergency_contact_name: z.string().trim().max(80).optional(),
    emergency_contact_phone: phoneSchema.optional().or(z.literal("")),
    emergency_contact_relation: z.string().trim().max(40).optional(),
  }).safeParse({
    first_name: form.get("first_name"), last_name: form.get("last_name"), phone: form.get("phone"), date_of_birth: form.get("date_of_birth") ?? "",
    goal: form.get("goal") ?? "", emergency_contact_name: form.get("emergency_contact_name") ?? "", emergency_contact_phone: form.get("emergency_contact_phone") ?? "",
    emergency_contact_relation: form.get("emergency_contact_relation") ?? "",
  });
  if (!parsed.success) return { ok: false, error: `Please check: ${[...new Set(parsed.error.issues.map((i) => LABEL[String(i.path[0])] ?? String(i.path[0])))].join(", ")}.` };

  const p = viewer.profile;
  const d = parsed.data;
  const me = form.get("marketing_email") === "on";
  const reminders = form.get("reminder_emails") === "on";
  const photos = String(form.get("photo_consent") ?? "");
  const photoConsent = photos in PHOTO_CONSENT ? (photos as PhotoConsent) : p.photo_consent;
  const saved = await db().from("profiles").update({
    first_name: d.first_name, last_name: d.last_name, full_name: fullName(d.first_name, d.last_name), phone: d.phone,
    date_of_birth: d.date_of_birth, goal: d.goal || null,
    emergency_contact_name: d.emergency_contact_name || null, emergency_contact_phone: d.emergency_contact_phone || null,
    emergency_contact_relation: d.emergency_contact_relation || null,
    photo_consent: photoConsent, marketing_email: me, reminder_emails: reminders,
  }).eq("id", p.id);
  if (saved.error) { console.error("profile save failed", saved.error); return { ok: false, error: "Your details couldn't be saved. Please try again." }; }
  const changes: { profile_id: string; type: "marketing_email" | "photos"; granted: boolean; version: string }[] = [];
  if (me !== p.marketing_email) changes.push({ profile_id: p.id, type: "marketing_email", granted: me, version: settings.policy_version });
  if (photoConsent && photoConsent !== p.photo_consent) changes.push({ profile_id: p.id, type: "photos", granted: photoConsent !== "none", version: `${settings.policy_version}:${photoConsent}` });
  if (changes.length) {
    const { error } = await db().from("consents").insert(changes);
    // The new choice is saved but its consent record isn't: say so rather than "Saved" (A-019).
    if (error) { console.error("consent log failed", error); return { ok: false, error: "Your details were saved, but your consent choice wasn't recorded. Please save again." }; }
  }
  // Her note: an email when a client changes their details (which ones, not the values of anything sensitive).
  const LABELS: [string, unknown, unknown][] = [
    ["name", fullName(d.first_name, d.last_name), p.full_name], ["mobile number", d.phone, p.phone], ["date of birth", d.date_of_birth, p.date_of_birth],
    ["goal", d.goal || null, p.goal], ["emergency contact", `${d.emergency_contact_name}|${d.emergency_contact_phone}|${d.emergency_contact_relation}`,
      `${p.emergency_contact_name ?? ""}|${p.emergency_contact_phone ?? ""}|${p.emergency_contact_relation ?? ""}`],
    ["photo consent", photoConsent, p.photo_consent],
  ];
  const changed = LABELS.filter(([, a, b]) => (a ?? "") !== (b ?? "")).map(([l]) => l);
  if (changed.length) await alertStudio("details", `Details updated: ${fullName(d.first_name, d.last_name)}`,
    [`Changed: ${changed.join(", ")}.`, changed.includes("mobile number") ? `New mobile number: ${d.phone}` : ""], { path: `/admin/clients/${p.id}` });
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

const LABEL: Record<string, string> = {
  first_name: "first name", last_name: "surname", phone: "mobile number", date_of_birth: "date of birth", emergency_contact_phone: "emergency contact phone",
};

export async function signOutAction() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

/** Right to erasure. Keeps only minimal, anonymised booking/payment records for accounting. */
export async function deleteAccount(form: FormData) {
  const viewer = await requireViewer("/account");
  if (String(form.get("confirm")).trim().toUpperCase() !== "DELETE") redirect("/account?delete=confirm");
  // Erase first; the login is deleted only once the data is gone (A-010, A-019).
  const { data, error } = await db().rpc("erase_profile", { p_profile: viewer.profile.id });
  if (error) {
    console.error("erase_profile failed", error);
    redirect("/account?delete=failed");
  }
  const res = { user_id: data as string | null };
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  if (res.user_id) {
    const { error: e } = await db().auth.admin.deleteUser(res.user_id);
    // Their data is already erased and the profile unlinked; a leftover login can't reach anything.
    if (e) console.error("auth user delete failed (profile already erased)", e);
  }
  redirect("/?deleted=1");
}
