import "server-only";
import { after } from "next/server";
import { runTick } from "@/lib/booking";
import { db } from "@/lib/supabase/admin";

// Opportunistic background tick (waitlist offers, reminders) on page views, at most once a minute
// per server instance, and only when the scheduler hasn't run for 10 minutes (A-049). The scheduled
// cron call to /api/cron/tick is the reliable path; this is the fallback (and keeps the demo lively).
let last = 0;
export const PAGE_TICK_AFTER_MS = 10 * 60_000;
export const pageTickDue = (lastTickAt: string | null, now = Date.now()) => !lastTickAt || now - new Date(lastTickAt).getTime() >= PAGE_TICK_AFTER_MS;

export function scheduleTick() {
  if (Date.now() - last < 60_000) return;
  last = Date.now();
  after(async () => {
    try {
      const { data } = await db().from("studio_settings").select("last_tick_at").eq("id", 1).single();
      if (pageTickDue(data?.last_tick_at ?? null)) await runTick("page");
    } catch (e) { console.error("tick failed", e); }
  });
}
