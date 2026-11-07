import { timingSafeEqual } from "node:crypto";

/** Constant-time check of "Authorization: Bearer <CRON_SECRET>" (A-089). */
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
