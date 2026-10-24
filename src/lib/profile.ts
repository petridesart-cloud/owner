import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";

export { PHOTO_CONSENT, type PhotoConsent } from "@/lib/photo-consent";

export const nameSchema = z.string().trim().min(1, "Please fill this in.").max(60);
export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Please enter a valid phone number, e.g. +357 99 123456.");
// Required (her answer, round 1). Ages 12–100.
export const dobSchema = z.string({ error: "Please add your date of birth." }).trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please add your date of birth.")
  .refine((d) => d >= yearsAgo(100) && d <= yearsAgo(12), "Please check the date.");

function yearsAgo(n: number) {
  const t = new Date();
  t.setFullYear(t.getFullYear() - n);
  return t.toISOString().slice(0, 10);
}

/** Age in whole years on a given day (default today). */
export function ageOn(dob: string, on = new Date().toISOString().slice(0, 10)) {
  const [y, m, d] = dob.split("-").map(Number);
  const [Y, M, D] = on.split("-").map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}

export const fullName = (first: string, last: string) => `${first} ${last}`.trim();

type Consent = { profile_id: string; type: "health_data" | "photos"; granted: boolean; version: string };

/**
 * Health info (special-category data): stored only with explicit consent, readable by
 * the client and instructor only. Empty fields delete it and record the withdrawal.
 */
export async function saveHealth(profileId: string, h: { injuries?: string; medication?: string }, consent: boolean, version: string) {
  const injuries = h.injuries?.trim().slice(0, 1000) || null;
  const medication = h.medication?.trim().slice(0, 500) || null;
  if (!injuries && !medication) {
    const { count } = await db().from("health_notes").select("profile_id", { count: "exact", head: true }).eq("profile_id", profileId);
    if (count) {
      await db().from("health_notes").delete().eq("profile_id", profileId);
      await db().from("consents").insert({ profile_id: profileId, type: "health_data", granted: false, version } satisfies Consent);
    }
    return { ok: true as const, cleared: !!count };
  }
  if (!consent) return { ok: false as const, error: "To store health information we need your explicit consent (tick the box), or leave it empty." };
  const now = new Date().toISOString();
  await db().from("health_notes").upsert({ profile_id: profileId, injuries, medication, note: null, consent_at: now, updated_at: now });
  await db().from("consents").insert({ profile_id: profileId, type: "health_data", granted: true, version } satisfies Consent);
  return { ok: true as const, cleared: false };
}
