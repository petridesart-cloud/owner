import { getViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

// CSV for the accountant: every paid payment (online and in person), any year.
// Route handlers aren't covered by the admin layout, so check the role here.
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer?.profile.role !== "admin") return new Response("Not found", { status: 404 });
  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();
  const { data } = await db().from("payments").select("id, paid_at, description, amount_cents, method, provider, purpose, profiles(full_name)")
    .eq("status", "paid").gte("paid_at", `${year}-01-01`).lt("paid_at", `${year + 1}-01-01`).order("paid_at");
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia", year: "numeric", month: "2-digit", day: "2-digit" });
  const rows = [["date", "month", "receipt_no", "client", "description", "type", "method", "amount_eur"]];
  for (const p of data ?? []) {
    const d = fmt.format(new Date(p.paid_at!));
    rows.push([d, d.slice(0, 7), p.id.slice(0, 8).toUpperCase(), p.profiles?.full_name ?? "", p.description, p.purpose, p.method ?? p.provider, (p.amount_cents / 100).toFixed(2)]);
  }
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reform-payments-${year}.csv"`, "Cache-Control": "no-store" },
  });
}
