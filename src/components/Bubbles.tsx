import Link from "next/link";

// Her notes (round 4): pill buttons like "Secure your package", lavender, text in the middle. No photos.
const links = [
  { href: "/studio", label: "Studio" },
  { href: "/events", label: "Events" },
  { href: "/policy", label: "Rules & policies" },
] as const;

export function Bubbles() {
  return (
    <nav aria-label="More about the studio" className="px-5">
      <ul className="grid grid-cols-3 gap-2.5">
        {links.map((b, i) => (
          <li key={b.href} className="animate-rise" style={{ animationDelay: `${80 + i * 50}ms` }}>
            <Link href={b.href}
              className="pressable flex min-h-12 items-center justify-center rounded-full bg-lilac-200 px-3 text-center text-[0.72rem] font-medium uppercase leading-tight tracking-[0.14em] text-ink shadow-[var(--shadow-soft)] hover:bg-lilac-300">
              {b.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
