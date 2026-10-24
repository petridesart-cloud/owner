import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/supabase/admin";

export const TOO_MANY = "You're doing that a lot. Please wait a few minutes and try again.";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/** Records an attempt; true when over `max` in the last `minutes` (fails open if the check itself errors). */
export async function rateLimited(kind: string, key: string, max: number, minutes: number) {
  const { data, error } = await db().rpc("rate_limited", { p_kind: kind, p_key: sha(key.toLowerCase()), p_max: max, p_window_minutes: minutes });
  if (error) { console.error("rate limit check failed", error); return false; }
  return data === true;
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}

/** Booking-type actions (book, cancel, waitlist, package request, weekly): generous, per client. */
export const bookingLimited = (profileId: string) => rateLimited("booking", profileId, 30, 10);
