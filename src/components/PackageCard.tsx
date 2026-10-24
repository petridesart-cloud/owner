import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PackageView } from "@/lib/packages";
import { dotDate, lastDay } from "@/lib/time";

export function packageDates(p: Pick<PackageView, "startedAt" | "expiresAt">) {
  if (!p.startedAt || !p.expiresAt) return "Starts with your first class";
  return `${dotDate(p.startedAt)} – ${dotDate(lastDay(p.expiresAt))}`;
}

/** "Reformer Package / 2 per week · 1 month / 13.10.2026 – 11.11.2026 / 3 classes left" */
export function PackageCard({ p }: { p: PackageView }) {
  return (
    <Link href={`/bookings/package/${p.id}`} className="card pressable group block overflow-hidden hover:shadow-[var(--shadow-lift)]">
      <div className="lilac-wash flex items-center gap-4 px-5 py-5">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[1.45rem] leading-tight text-ink">{p.title}</p>
          <p className="mt-1 text-sm text-ink">{p.subtitle}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{packageDates(p)}</p>
        </div>
        <div className="text-center">
          <p data-left className="font-serif text-[2.6rem] leading-none text-ink">{p.remaining}</p>
          <p className="text-xs text-ink-soft">class{p.remaining === 1 ? "" : "es"} left</p>
        </div>
        <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-soft transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

/** Past package row with progress, e.g. 6/8. */
export function PastPackageRow({ p }: { p: PackageView }) {
  const pct = Math.round((p.attended / Math.max(p.total, 1)) * 100);
  return (
    <Link href={`/bookings/package/${p.id}`} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-lilac-50">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{p.title}</p>
        <p className="text-sm text-ink">{p.subtitle}</p>
        <p className="text-xs text-ink-soft">{packageDates(p)}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-lilac-100" aria-hidden>
          <div className="h-full rounded-full bg-lilac-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="font-serif text-2xl text-ink" aria-label={`${p.attended} of ${p.total} classes attended`}>{p.attended}/{p.total}</p>
      <ChevronRight aria-hidden size={16} className="shrink-0 text-ink-soft" />
    </Link>
  );
}
