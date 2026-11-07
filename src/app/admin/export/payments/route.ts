import { getViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { csvCell } from "@/lib/csv";
import { localToUtc, todayKey } from "@/lib/time";

type Row = { id: string; paid_at: string | null; description: string; amount_cents: number; method: string | null; provider: string; purpose: string; profiles: { full_name: string | null } | null };

// CSV for the accountant: every paid payment (online and in person), any year.
// Route handlers aren't covered by the admin layout, so check the role here.
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer?.profile.role !== "admin") return new Response("Not found", { status: 404 });
  const year = Number(new URL(req.url).searchParams.get("year")) || Number(todayKey().slice(0, 4));
  // The year is the studio's calendar year (Europe/Nicosia), and every page of rows is read (the API caps a page at 1,000).
  const from = localToUtc(`${year}-01-01`, "00:00"), to = localToUtc(`${year + 1}-01-01`, "00:00");
  const data: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data: page, error } = await db().from("payments").select("id, paid_at, description, amount_cents, method, provider, purpose, profiles(full_name)")
      .eq("status", "paid").gte("paid_at", from).lt("paid_at", to).order("paid_at").order("id").range(at, at + 999);
    if (error) return new Response("Couldn't read payments. Please try again.", { status: 500 });
    data.push(...(page as unknown as Row[]));
    if ((page?.length ?? 0) < 1000) break;
  }
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia", year: "numeric", month: "2-digit", day: "2-digit" });
  const rows = [["date", "month", "receipt_no", "client", "description", "type", "method", "amount_eur"]];
  for (const p of data) {
    const d = fmt.format(new Date(p.paid_at!));
    rows.push([d, d.slice(0, 7), p.id.slice(0, 8).toUpperCase(), p.profiles?.full_name ?? "", p.description, p.purpose, p.method ?? p.provider, (p.amount_cents / 100).toFixed(2)]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reform-payments-${year}.csv"`, "Cache-Control": "no-store" },
  });
}
