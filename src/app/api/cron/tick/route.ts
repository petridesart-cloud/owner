import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/booking";

// Called every 5 minutes by Supabase pg_cron (scheduled by scripts/migrate.mjs on deploy) with
// "Authorization: Bearer $CRON_SECRET". Sends reminders and advances waitlists. A run where any
// step failed answers 500 (and is recorded in studio_settings.last_tick_error), so it shows up.
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await runTick("cron");
  return NextResponse.json(r, { status: r.errors.length ? 500 : 200 });
}
