import type { Metadata } from "next";
import { db } from "@/lib/supabase/admin";
import { dotDate, todayKey } from "@/lib/time";
import { discountLabel, type DiscountKind } from "@/lib/discount";
import { createCode, setCodeActive } from "../../actions";
import { AdminTitle } from "../../ui";
import { DiscountForm } from "../DiscountForm";

export const metadata: Metadata = { title: "Discount codes" };
export const dynamic = "force-dynamic";

/** Codes anyone can type on the Packages page. Personal rewards live on each client's page. */
export default async function CodesPage() {
  const { data: codes } = await db().from("discount_codes").select("id, code, kind, value, note, expires_on, max_uses, active, created_at, payments(status)")
    .is("profile_id", null).order("created_at", { ascending: false });
  const today = todayKey();
  return (
    <div className="space-y-5">
      <AdminTitle back="/admin/clients" title="Discount codes" sub="Clients type a code on the Packages page. Each client can use a code once." />

      <section className="card px-5 py-4">
        <h2 className="display mb-3 text-[0.95rem]">New code</h2>
        <DiscountForm action={createCode} code />
      </section>

      <section className="card px-5 py-4" aria-labelledby="codes">
        <h2 id="codes" className="display mb-3 text-[0.95rem]">Your codes</h2>
        {(codes ?? []).length ? (
          <ul className="divide-y divide-line">
            {codes!.map((c) => {
              const paid = c.payments.filter((p) => p.status === "paid").length;
              const waiting = c.payments.filter((p) => p.status === "pending").length;
              const ended = !!c.expires_on && c.expires_on < today;
              const full = !!c.max_uses && paid + waiting >= c.max_uses;
              const state = !c.active ? "Off" : ended ? `Ended ${dotDate(c.expires_on!)}` : full ? "All used" : c.expires_on ? `Live until ${dotDate(c.expires_on)}` : "Live";
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-mono font-medium tracking-wide text-ink">{c.code}</span>
                    <span className="block text-ink">{discountLabel(c.kind as DiscountKind, c.value)}</span>
                    <span className="block text-xs text-ink-soft">
                      {state} · used {paid}{c.max_uses ? ` of ${c.max_uses}` : ""}{waiting ? ` · ${waiting} waiting for payment` : ""}{c.note ? ` · ${c.note}` : ""}
                    </span>
                  </span>
                  {!ended && (
                    <form action={setCodeActive.bind(null, c.id, !c.active)} className="shrink-0">
                      <button className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-line bg-white px-4 text-sm text-ink">{c.active ? "Turn off" : "Turn on"}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-ink-soft">No codes yet. Create one above, then share it on Instagram or with a client.</p>}
      </section>
    </div>
  );
}
