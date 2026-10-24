import type { MediaItem } from "@/lib/media";

/** Horizontal photo strip; gradient placeholders labelled "photo coming soon" until she uploads. */
export function PhotoStrip({ photos, label, tall = false, slides = false }: { photos: MediaItem[]; label: string; tall?: boolean; slides?: boolean }) {
  // slides: one big photo at a time, swiped sideways.
  const size = slides ? "h-80 w-[85%] snap-center" : tall ? "h-72 w-56 snap-start" : "h-52 w-44 snap-start";
  return (
    <div className={`no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 ${slides ? "scroll-px-5" : ""}`}>
      {photos.length ? photos.map((p) => (
        <figure key={p.id} className={`relative ${size} shrink-0 overflow-hidden rounded-[var(--radius-card)] bg-lilac-100 shadow-[var(--shadow-soft)]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.caption ?? label} loading="lazy" className="size-full object-cover" />
          {p.caption && <figcaption className="absolute inset-x-3 bottom-3 rounded-full bg-white/80 px-3 py-1.5 text-center text-xs font-medium text-ink backdrop-blur">{p.caption}</figcaption>}
        </figure>
      )) : (
        <figure className={`relative ${tall ? size : slides ? "h-40 w-full" : "h-24 w-full"} shrink-0 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-lilac-200 to-mauve-soft shadow-[var(--shadow-soft)]`}>
          <figcaption className="absolute inset-x-3 bottom-3 rounded-full bg-white/80 px-3 py-1.5 text-center text-xs font-medium text-ink backdrop-blur">{label} · photo coming soon</figcaption>
        </figure>
      )}
    </div>
  );
}
