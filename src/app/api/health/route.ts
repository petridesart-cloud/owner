import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * A-056: for an uptime monitor. 200 while the 5-minute scheduler has succeeded in the last 30 minutes, else 503.
 * Exposes only whether things are fine and how old the last tick is: no names, no errors.
 */
export async function GET() {
  const { data, error } = await db().from("studio_settings").select("last_tick_ok_at, last_cron_tick_at").eq("id", 1).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, reason: "database" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const last = data.last_tick_ok_at ?? data.last_cron_tick_at;
  const tickAgeMinutes = last ? Math.round((nowMs() - new Date(last).getTime()) / 60_000) : null;
  const ok = tickAgeMinutes !== null && tickAgeMinutes <= 30;
  return NextResponse.json({ ok, tickAgeMinutes }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
