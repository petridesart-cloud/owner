import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { longDate } from "@/lib/time";
import { AdminTitle } from "../../ui";

export const dynamic = "force-dynamic";

// Her note (9 Nov): every past event, so she can edit its words and photos for Previous events at any time.
export default async function PastEventsPage() {
  const { data } = await db().from("class_sessions")
    .select("id, starts_at, status, title, recap, description, class_types!inner(kind, name)")
    .eq("class_types.kind", "event").lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false }).limit(200);
  const events = data ?? [];
  return (
    <div>
      <AdminTitle back="/admin/classes" title="Past events" sub="Tap an event to change its title, text or photos. Previous events on the client app updates straight away." />
      {events.length ? (
        <ul className="card divide-y divide-line">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/classes/${e.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-lilac-50">
                <span className={e.status === "cancelled" ? "line-through opacity-60" : ""}>
                  <span className="block font-medium text-ink">{e.title ?? e.class_types?.name ?? "Event"}</span>
                  <span className="block text-sm text-ink-soft">{longDate(e.starts_at)}{!e.recap && !e.description && e.status !== "cancelled" ? " · no text yet" : ""}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {e.status === "cancelled" && <Badge tone="full">Cancelled</Badge>}
                  <ChevronRight aria-hidden size={16} className="text-ink-soft" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card px-5 py-8 text-center text-ink-soft">No past events yet.</p>
      )}
    </div>
  );
}
