import Link from "next/link";

// Instagram story-highlight style navigation.
const bubbles = [
  { href: "/schedule", label: "Schedule", inner: "Schedule" },
  { href: "/studio", label: "Our Studio", inner: "Our Studio" },
  { href: "/magic", label: "The Magic", inner: "The Magic" },
  { href: "/policy", label: "Policy", inner: "Studio Rules" },
  { href: "/packs", label: "Packages", inner: "Packages" },
];

export function Bubbles() {
  return (
    <nav aria-label="Highlights" className="no-scrollbar -mx-1 overflow-x-auto">
      <ul className="flex gap-4 px-5 pb-1">
        {bubbles.map((b, i) => (
          <li key={b.href} className="animate-rise" style={{ animationDelay: `${80 + i * 50}ms` }}>
            <Link href={b.href} className="group flex w-[76px] flex-col items-center gap-2 rounded-2xl">
              <span className="grid size-[72px] place-items-center rounded-full bg-gradient-to-br from-lilac-300 via-lilac-200 to-paper p-[2.5px] shadow-[var(--shadow-soft)] transition duration-300 group-hover:scale-105 group-active:scale-95">
                <span className="grid size-full place-items-center rounded-full bg-[radial-gradient(circle_at_50%_80%,#fff_0%,#efe6f8_60%,#e2d2f2_100%)] px-1.5 text-center font-serif text-[0.8rem] leading-[1.05] text-ink" aria-hidden>
                  {b.inner}
                </span>
              </span>
              <span className="text-[0.72rem] font-medium text-ink">{b.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
