import { nowMs } from "@/lib/time";

// The 5-minute scheduler counts as healthy if it ran in the last 20 minutes.
export const schedulerHealthy = (last: string | null) => !!last && nowMs() - new Date(last).getTime() < 20 * 60_000;

export function ago(iso: string) {
  const mins = Math.round((nowMs() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 90) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}
