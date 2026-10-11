"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { getSettings, requireViewer } from "@/lib/auth";

export type SaveState = { ok: boolean; message?: string; error?: string };

export async function saveProfile(_: SaveState, form: FormData): Promise<SaveState> {
  const viewer = await requireViewer("/account");
  const settings = await getSettings();
  const parsed = z.object({
    full_name: z.string().trim().min(2).max(80),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/),
  }).safeParse({ full_name: form.get("full_name"), phone: form.get("phone") });
  if (!parsed.success) return { ok: false, error: "Please check your name and phone number." };

  const p = viewer.profile;
  const me = form.get("marketing_email") === "on";
  const ms = form.get("marketing_sms") === "on";
  await db().from("profiles").update({ ...parsed.data, marketing_email: me, marketing_sms: ms }).eq("id", p.id);
  const changes = [];
  if (me !== p.marketing_email) changes.push({ profile_id: p.id, type: "marketing_email" as const, granted: me, version: settings.policy_version });
  if (ms !== p.marketing_sms) changes.push({ profile_id: p.id, type: "marketing_sms" as const, granted: ms, version: settings.policy_version });
  if (changes.length) await db().from("consents").insert(changes);
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

export async function saveHealthNote(_: SaveState, form: FormData): Promise<SaveState> {
  const viewer = await requireViewer("/account");
  const settings = await getSettings();
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  const p = viewer.profile;
  if (!note) {
    await db().from("health_notes").delete().eq("profile_id", p.id);
    await db().from("consents").insert({ profile_id: p.id, type: "health_data", granted: false, version: settings.policy_version });
    revalidatePath("/account");
    return { ok: true, message: "Health note deleted and consent withdrawn." };
  }
  if (form.get("consent") !== "on") return { ok: false, error: "Please tick the consent box to store a health note." };
  await db().from("health_notes").upsert({ profile_id: p.id, note, consent_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await db().from("consents").insert({ profile_id: p.id, type: "health_data", granted: true, version: settings.policy_version });
  revalidatePath("/account");
  return { ok: true, message: "Health note saved. Only your instructor can see it." };
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
