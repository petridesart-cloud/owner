"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Sparkles, UserRound } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/bookings", label: "My classes", icon: Sparkles },
  { href: "/account", label: "Account", icon: UserRound },
];

export function BottomNav() {
  const path = usePathname();
  const activeIndex = tabs.findIndex(({ href }) => (href === "/" ? path === "/" : path.startsWith(href)));
  return (
    <nav aria-label="Main" className="glass pb-safe print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line/80">
      <ul className="relative mx-auto grid max-w-xl grid-cols-4">
        {/* Indicator glides between tabs */}
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1/4 transition-transform duration-500 [transition-timing-function:var(--ease-spring)]"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          >
            <span className="mx-auto mt-[7px] block h-8 w-12 rounded-full bg-lilac-100" />
          </span>
        )}
        {tabs.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 text-[0.7rem] font-medium tracking-wide transition-colors ${active ? "text-ink" : "text-ink-soft"}`}
              >
                <span className={`grid h-8 w-12 place-items-center transition-transform duration-300 [transition-timing-function:var(--ease-spring)] ${active ? "scale-110" : "scale-100"}`}>
                  <Icon aria-hidden size={20} strokeWidth={active ? 2.1 : 1.6} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
