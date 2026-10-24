import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/booking";

// Called every 5 minutes by Supabase pg_cron (scheduled by scripts/migrate.mjs on deploy) with
// "Authorization: Bearer $CRON_SECRET". Sends reminders and advances waitlists.
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runTick("cron"));
}
