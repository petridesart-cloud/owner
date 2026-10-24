"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin, getSettings } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/errors";
import { STUDIO_SLOT } from "@/lib/media";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function validSlot(slot: string) {
  if (slot === "logo" || slot === "instructor") return true;
  if (slot === STUDIO_SLOT) return true;
  if (slot.startsWith("studio:")) return (await getSettings()).studio_sections.includes(slot.slice(7)); // older sections
  if (slot.startsWith("event:") || slot.startsWith("event-cover:")) {
    const id = slot.slice(slot.indexOf(":") + 1);
    if (!/^[0-9a-f-]{36}$/.test(id)) return false;
    const { data } = await db().from("class_sessions").select("id, class_types!inner(kind)").eq("id", id).eq("class_types.kind", "event").maybeSingle();
    return !!data;
  }
  return false;
}

/** Her photos go to the public "media" bucket. Only images, max 5 MB; the logo slot holds one.
 * Short CDN cache so a removed photo (e.g. someone withdrew consent) disappears within the hour. */
export async function uploadPhoto(slot: string, form: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a photo first." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Please use a JPG, PNG or WebP photo." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "That photo is too large (max 5 MB)." };
  if (!(await validSlot(slot))) return { ok: false, error: "Unknown place for this photo." };

  const path = `${slot.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}/${randomUUID()}.${ext}`;
  const { error } = await db().storage.from("media").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "3600" });
  if (error) return { ok: false, error: "Upload failed. Please try again." };

  if (slot === "logo" || slot.startsWith("event-cover:")) { // one picture: replace the old one
    const { data: old } = await db().from("media").select("id, path").eq("slot", slot);
    if (old?.length) {
      await db().storage.from("media").remove(old.map((o) => o.path));
      await db().from("media").delete().in("id", old.map((o) => o.id));
    }
  }
  const caption = String(form.get("caption") ?? "").trim().slice(0, 80) || null;
  const { count } = await db().from("media").select("id", { count: "exact", head: true }).eq("slot", slot);
  await db().from("media").insert({ slot, path, caption, sort: count ?? 0 });
  await db().from("audit_log").insert({ actor_profile_id: viewer.profile.id, action: "upload_photo", details: { slot, path } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo added." };
}

export async function deletePhoto(id: string): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const { data: m } = await db().from("media").select("id, path, slot").eq("id", id).maybeSingle();
  if (!m) return { ok: false, error: "Already removed." };
  await db().storage.from("media").remove([m.path]);
  await db().from("media").delete().eq("id", id);
  await db().from("audit_log").insert({ actor_profile_id: viewer.profile.id, action: "delete_photo", details: { slot: m.slot, path: m.path } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setCaption(id: string, caption: string): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await db().from("media").update({ caption: caption.trim().slice(0, 80) || null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save the caption." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Move a photo one place earlier (-1) or later (1) within its section. */
export async function movePhoto(id: string, dir: -1 | 1): Promise<ActionResult> {
  await requireAdmin();
  const { data: m } = await db().from("media").select("slot").eq("id", id).maybeSingle();
  if (!m) return { ok: false, error: "Photo not found." };
  const { data: list } = await db().from("media").select("id").eq("slot", m.slot).order("sort").order("created_at");
  const ids = (list ?? []).map((x) => x.id);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((pid, sort) => db().from("media").update({ sort }).eq("id", pid)));
  revalidatePath("/", "layout");
  return { ok: true };
}
