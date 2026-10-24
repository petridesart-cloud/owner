import "server-only";
import { after } from "next/server";
import { runTick } from "@/lib/booking";

// Opportunistic background tick (waitlist offers, reminders) on page views, at most
// once a minute per server instance. A scheduled cron call to /api/cron/tick is
// the reliable path in production; this keeps the demo lively without one.
let last = 0;
export function scheduleTick() {
  if (Date.now() - last < 60_000) return;
  last = Date.now();
  after(async () => {
    try { await runTick("page"); } catch (e) { console.error("tick failed", e); }
  });
}
