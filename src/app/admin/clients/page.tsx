import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/lib/supabase/admin";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  let query = db().from("profiles").select("id, full_name, email, phone, created_at, user_id, credit_lots(remaining, expires_at, credit_kind), bookings(status)")
    .is("deleted_at", null).eq("role", "client").order("full_name").limit(300);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: clients } = await query;
  const now = new Date();

  return (
    <div>
      <AdminTitle title="Clients" sub={`${clients?.length ?? 0} shown`} />
      <form className="relative mb-4" role="search">
        <label htmlFor="q" className="sr-only">Search clients</label>
        <Search aria-hidden size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input id="q" name="q" defaultValue={q} placeholder="Search name, email or phone" className="min-h-12 w-full rounded-full border border-line bg-white pl-10 pr-4 text-ink focus:border-plum-700 focus:outline-none focus:ring-2 focus:ring-lilac-300" />
      </form>
      <ul className="card divide-y divide-line">
        {(clients ?? []).map((c) => {
          const credits = c.credit_lots.filter((l) => l.remaining > 0 && (!l.expires_at || new Date(l.expires_at) > now));
          const ref = credits.filter((l) => l.credit_kind === "reformer").reduce((n, l) => n + l.remaining, 0);
          const mat = credits.filter((l) => l.credit_kind === "mat").reduce((n, l) => n + l.remaining, 0);
          const visits = c.bookings.filter((b) => b.status === "confirmed").length;
          return (
            <li key={c.id}>
              <Link href={`/admin/clients/${c.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-lilac-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{c.full_name ?? c.email ?? "Unnamed"}</span>
                  <span className="block truncate text-xs text-ink-soft">{c.email ?? "no email"}{c.phone ? ` · ${c.phone}` : ""}{!c.user_id ? " · not signed up yet" : ""}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-ink-soft">{visits} bookings<br />{ref ? `${ref} ref.` : ""}{ref && mat ? " · " : ""}{mat ? `${mat} mat` : ""}</span>
              </Link>
            </li>
          );
        })}
        {clients?.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-soft">No clients found.</li>}
      </ul>
    </div>
  );
}
