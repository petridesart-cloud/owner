// Pure helpers for rate limits and email lookups (no server-only imports, so they can be unit-tested).
import { createHmac } from "node:crypto";

/** Emails are stored lower-case; look them up with exact equality (never `ilike`: `_` and `%` are wildcards). */
export const normEmail = (email: string) => email.trim().toLowerCase();

/** Keyed hash (HMAC-SHA-256) of an email, IP or id, so stored rate-limit keys can't be reversed by guessing. */
export function keyHash(secret: string, value: string) {
  return createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
}

/**
 * The caller's IP. Assumes Vercel: `x-vercel-forwarded-for` and `x-real-ip` are set by the platform and
 * can't be supplied by the client. `x-forwarded-for` is only a fallback (spoofable on other hosts).
 */
export function ipFrom(get: (name: string) => string | null) {
  for (const name of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const ip = (get(name) ?? "").split(",")[0].trim();
    if (ip) return ip;
  }
  return "local";
}

/** Sign-in and code limits fail closed: if the check itself errors, the attempt is refused. */
export const FAIL_CLOSED_KINDS: ReadonlySet<string> = new Set(["signin", "signin_ip", "code", "code_ip", "code_all"]);

export function limitOutcome(kind: string, data: unknown, error: unknown) {
  if (error) return FAIL_CLOSED_KINDS.has(kind);
  return data === true;
}
