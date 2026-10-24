import "server-only";
import { db } from "@/lib/supabase/admin";

export type MediaItem = { id: string; slot: string; path: string; caption: string | null; sort: number; url: string };

const BUCKET = "media";
export const DEFAULT_LOGO = "/logo-instagram.png";
/** New studio photos go here; the Studio page shows every 'studio:*' slot (older uploads had one per section). */
export const STUDIO_SLOT = "studio:space";

export function publicUrl(path: string) {
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Photos for a slot ('logo', 'studio:space', 'event:<id>', 'event-cover:<id>') or every slot starting with a prefix ('studio:'). */
export async function getMedia(slotOrPrefix: string): Promise<MediaItem[]> {
  const q = db().from("media").select("id, slot, path, caption, sort").order("sort").order("created_at");
  const { data } = slotOrPrefix.endsWith(":") ? await q.like("slot", `${slotOrPrefix}%`) : await q.eq("slot", slotOrPrefix);
  return (data ?? []).map((m) => ({ ...m, url: publicUrl(m.path) }));
}

/** Her uploaded logo, or the interim one cut from her Instagram avatar. */
export async function logoSrc() {
  const [logo] = await getMedia("logo").catch(() => []);
  return logo?.url ?? DEFAULT_LOGO;
}
