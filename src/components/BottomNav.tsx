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
  return (
    <nav aria-label="Main" className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/80">
      <ul className="mx-auto flex max-w-xl justify-around px-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 px-2 text-[0.68rem] font-medium tracking-wide transition ${active ? "text-ink" : "text-ink-soft"}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${active ? "bg-lilac-100" : ""}`}>
                  <Icon aria-hidden size={20} strokeWidth={active ? 2 : 1.6} />
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
