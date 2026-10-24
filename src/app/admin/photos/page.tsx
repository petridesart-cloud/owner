import { requireAdmin } from "@/lib/auth";
import { getMedia, DEFAULT_LOGO, STUDIO_SLOT, type MediaItem } from "@/lib/media";
import { db } from "@/lib/supabase/admin";
import { dotDate, nowMs } from "@/lib/time";
import { AdminTitle } from "../ui";
import { DeletePhoto, PhotoControls, Uploader } from "./Uploader";

export const dynamic = "force-dynamic";

function Slot({ title, hint, slot, photos, single = false, fallback }: { title: string; hint?: string; slot: string; photos: MediaItem[]; single?: boolean; fallback?: string }) {
  return (
    <section className="card px-4 py-4">
      <h2 className="font-medium text-ink">{title}</h2>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={p.id}>
            <div className="relative size-24 overflow-hidden rounded-2xl bg-lilac-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption ?? title} className="size-full object-cover" loading="lazy" />
              <DeletePhoto id={p.id} />
            </div>
            {!single && <PhotoControls id={p.id} caption={p.caption ?? ""} first={i === 0} last={i === photos.length - 1} />}
          </div>
        ))}
        {!photos.length && fallback && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fallback} alt="Current logo" className="size-24 rounded-full object-cover opacity-80" />
        )}
        <Uploader slot={slot} label={`Add photo to ${title}`} single={single} />
      </div>
    </section>
  );
}

export default async function PhotosPage() {
  await requireAdmin();
  const [all, { data: events }] = await Promise.all([
    Promise.all([getMedia("logo"), getMedia("instructor"), getMedia("studio:"), getMedia("event:")]).then((g) => g.flat()),
    db().from("class_sessions").select("id, title, starts_at, class_types!inner(kind)").eq("class_types.kind", "event").eq("status", "scheduled")
      .gte("starts_at", new Date(nowMs() - 365 * 86_400_000).toISOString()).order("starts_at", { ascending: false }).limit(20),
  ]);
  const of = (slot: string) => all.filter((m) => m.slot === slot);

  return (
    <div className="space-y-4">
      <AdminTitle back="/admin/settings" title="Photos" sub="Only your own photos, and only with permission from anyone in them. They're resized automatically." />
      <Slot title="Logo" hint="Shown on the home page, sign-in and receipts. A square PNG works best." slot="logo" photos={of("logo")} single fallback={DEFAULT_LOGO} />
      <Slot title="You (The Magic)" hint="Shown with your story at the bottom of the Studio page." slot="instructor" photos={of("instructor")} />
      <Slot title="The Studio" hint="Photos of the space. They slide one after another on the Studio page. Add a few words in Settings → Your texts." slot={STUDIO_SLOT} photos={all.filter((m) => m.slot.startsWith("studio:"))} />
      <h2 className="display pt-2 text-[0.95rem]">Events</h2>
      {(events ?? []).map((e) => <Slot key={e.id} title={`${e.title ?? "Event"} · ${dotDate(e.starts_at)}`} slot={`event:${e.id}`} photos={of(`event:${e.id}`)} />)}
      {!(events ?? []).length && <p className="text-sm text-ink-soft">Create an event in Classes first, then add its photos here.</p>}
      <p className="text-xs text-ink-soft">An event&apos;s background picture is set on the event itself (Classes → the event).</p>
    </div>
  );
}
