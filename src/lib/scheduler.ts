import { nowMs } from "@/lib/time";

// The 5-minute scheduler counts as healthy if it ran in the last 20 minutes.
export const schedulerHealthy = (last: string | null) => !!last && nowMs() - new Date(last).getTime() < 20 * 60_000;

/** Warn on Today when the scheduler is late, or has never run on the real app (A-102); the demo may have no scheduler. */
export const schedulerWarning = (last: string | null, demo: boolean) => (!!last || !demo) && !schedulerHealthy(last);

export function ago(iso: string) {
  const mins = Math.round((nowMs() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 90) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}
