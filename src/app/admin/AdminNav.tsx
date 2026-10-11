"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/admin", "Today"], ["/admin/classes", "Classes"], ["/admin/timetable", "Timetable"], ["/admin/closures", "Closures"], ["/admin/clients", "Clients"],
  ["/admin/outbox", "Outbox"], ["/admin/stats", "Stats"], ["/admin/import", "Import"], ["/admin/settings", "Settings"], ["/admin/compliance", "Compliance"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Studio admin" className="no-scrollbar mx-auto max-w-3xl overflow-x-auto px-3 pb-2">
      <ul className="flex gap-1.5">
        {items.map(([href, label]) => {
          const active = href === "/admin" ? path === href : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3.5 text-sm transition ${active ? "bg-ink text-paper" : "text-ink hover:bg-lilac-100"}`}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
