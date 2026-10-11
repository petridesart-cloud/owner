"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Five tabs keep it simple on her phone; less-used tools live inside Classes and Settings.
const items = [
  { href: "/admin", label: "Today", also: [] as string[] },
  { href: "/admin/classes", label: "Classes", also: ["/admin/timetable", "/admin/closures"] },
  { href: "/admin/clients", label: "Clients", also: [] },
  { href: "/admin/stats", label: "Stats", also: [] },
  { href: "/admin/settings", label: "Settings", also: ["/admin/outbox", "/admin/import", "/admin/compliance", "/admin/texts", "/admin/team"] },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Studio admin" className="mx-auto max-w-3xl px-3 pb-2">
      <ul className="grid grid-cols-5 gap-1">
        {items.map(({ href, label, also }) => {
          const active = href === "/admin" ? path === href : path.startsWith(href) || also.some((a) => path.startsWith(a));
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center justify-center rounded-full text-sm transition ${active ? "bg-ink text-paper" : "text-ink hover:bg-lilac-100"}`}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
