import Link from "next/link";
import { Cake, ChevronRight, Search } from "lucide-react";
import { db } from "@/lib/supabase/admin";
import { todayKey } from "@/lib/time";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

type Row = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; date_of_birth: string | null };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  let query = db().from("profiles")
    .select("id, full_name, first_name, last_name, email, phone, date_of_birth, credit_lots(remaining, expires_at), bookings(status, class_sessions(starts_at))")
    .is("deleted_at", null).eq("role", "client").limit(2000);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data } = await query;
  const now = new Date().toISOString();
  const today = todayKey().slice(5);

  // Active: classes left in a package that hasn't expired, or a class coming up (trial, drop-in, event).
  const isActive = (c: NonNullable<typeof data>[number]) =>
    c.credit_lots.some((l) => l.remaining > 0 && (!l.expires_at || l.expires_at > now)) ||
    c.bookings.some((b) => b.status === "confirmed" && (b.class_sessions?.starts_at ?? "") > now);
  const name = (c: Row) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.full_name || c.email || "Unnamed";
  const sorted = [...(data ?? [])].sort((a, b) => name(a).localeCompare(name(b), "en", { sensitivity: "base" }));
  const active = sorted.filter(isActive);
  const inactive = sorted.filter((c) => !isActive(c));

  const list = (rows: Row[], birthdays: boolean) => (
    <ul className="card divide-y divide-line">
      {rows.map((c) => {
        const birthday = birthdays && c.date_of_birth?.slice(5) === today;
        return (
          <li key={c.id}>
            <Link href={`/admin/clients/${c.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-lilac-50">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{name(c)}</span>
                <span className="block truncate text-sm text-ink-soft">{c.phone ?? "no phone"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {birthday && <Cake aria-label="Birthday today" size={20} className="text-plum-700" />}
                <ChevronRight aria-hidden size={16} className="text-ink-soft" />
              </span>
            </Link>
          </li>
        );
      })}
      {rows.length === 0 && <li className="px-4 py-5 text-center text-sm text-ink-soft">Nobody here{term ? " for this search" : ""}.</li>}
    </ul>
  );

  return (
    <div>
      <AdminTitle title="Clients" sub={`${active.length} active · ${inactive.length} not active`} />
      <form className="relative mb-5" role="search">
        <label htmlFor="q" className="sr-only">Search clients</label>
        <Search aria-hidden size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input id="q" name="q" defaultValue={q} placeholder="Search name, email or phone" className="min-h-12 w-full rounded-full border border-line bg-white pl-10 pr-4 text-ink focus:border-plum-700 focus:outline-none focus:ring-2 focus:ring-lilac-300" />
      </form>

      <h2 className="display mb-1 text-[0.95rem] text-ink">Active</h2>
      <p className="mb-2 text-xs text-ink-soft">A package with classes left, or a trial, drop-in or event coming up.</p>
      {list(active, true)}

      <h2 className="display mb-1 mt-8 text-[0.95rem] text-ink">Not active</h2>
      <p className="mb-2 text-xs text-ink-soft">Signed up, but nothing current: never bought, or their last package has ended.</p>
      {list(inactive, false)}
    </div>
  );
}
