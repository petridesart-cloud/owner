import Link from "next/link";

// Instagram story-highlight style navigation. `covers` are her photos (Admin → Photos), if any.
const bubbles = [
  { href: "/studio", label: "Studio", inner: "Studio", cover: "studio" },
  { href: "/events", label: "Events", inner: "Events", cover: "events" },
  { href: "/policy", label: "Rules & policies", inner: "Studio Rules", cover: "policy" },
] as const;

export function Bubbles({ covers = {} }: { covers?: Partial<Record<(typeof bubbles)[number]["cover"], string>> }) {
  return (
    <nav aria-label="Highlights">
      <ul className="flex justify-center gap-5 px-5 pb-1">
        {bubbles.map((b, i) => {
          const img = covers[b.cover];
          return (
            <li key={b.href} className="animate-rise" style={{ animationDelay: `${80 + i * 50}ms` }}>
              <Link href={b.href} className="group flex w-[84px] flex-col items-center gap-2 rounded-2xl">
                <span className="grid size-[76px] place-items-center rounded-full bg-gradient-to-br from-lilac-300 via-lilac-200 to-paper p-[2.5px] shadow-[var(--shadow-soft)] transition duration-300 group-hover:scale-105 group-active:scale-95">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="size-full rounded-full border-2 border-paper object-cover" loading="lazy" />
                  ) : (
                    <span className="grid size-full place-items-center rounded-full bg-[radial-gradient(circle_at_50%_80%,#fff_0%,#efe6f8_60%,#e2d2f2_100%)] px-1.5 text-center font-serif text-[0.82rem] leading-[1.05] text-ink" aria-hidden>
                      {b.inner}
                    </span>
                  )}
                </span>
                <span className="text-center text-[0.72rem] font-medium leading-tight text-ink">{b.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
