import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { ipFrom, keyHash, limitOutcome } from "@/lib/request-keys";

export const TOO_MANY = "You're doing that a lot. Please wait a few minutes and try again.";

/** Secret for the keyed hashes (RATE_LIMIT_SECRET, else CRON_SECRET, else the server key: always set on the server). */
const secret = () => process.env.RATE_LIMIT_SECRET || env.cronSecret || env.supabaseServiceKey;

/**
 * Records an attempt; true when over `max` in the last `minutes`. If the check itself errors, sign-in and
 * code kinds fail closed (refused); the others fail open so a database hiccup doesn't block bookings.
 */
export async function rateLimited(kind: string, key: string, max: number, minutes: number) {
  const { data, error } = await db().rpc("rate_limited", { p_kind: kind, p_key: keyHash(secret(), key), p_max: max, p_window_minutes: minutes });
  if (error) console.error("rate limit check failed", kind, error);
  return limitOutcome(kind, data, error);
}

export async function clientIp() {
  const h = await headers();
  return ipFrom((name) => h.get(name));
}

/** Booking-type actions (book, cancel, waitlist, package request, weekly): generous, per client. */
export const bookingLimited = (profileId: string) => rateLimited("booking", profileId, 30, 10);
