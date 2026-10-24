import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { needsClearance } from "@/lib/health";
import { todayKey } from "@/lib/time";

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
export function ageOn(dob: string, on = todayKey()) {
  const [y, m, d] = dob.split("-").map(Number);
  const [Y, M, D] = on.split("-").map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}

export const fullName = (first: string, last: string) => `${first} ${last}`.trim();

type Consent = { profile_id: string; type: "health_data" | "photos"; granted: boolean; version: string };



export type HealthAnswers = {
  conditions: string[]; details: string | null; pregnancy: "current" | "past" | null;
  pregnancyWeeks: number | null; postpartumMonths: number | null; bpMeds: boolean; medication: string | null;
};

/**
 * Health questions v2. Always records when they were answered. The answers themselves are
 * health data: stored (instructor-only) only with explicit consent, which the form requires
 * whenever there is something to store. "No conditions" clears any earlier answers.
 */
export async function saveHealthAnswers(profileId: string, a: HealthAnswers, consent: boolean, version: string) {
  const now = new Date().toISOString();
  const anything = a.conditions.length > 0 || a.bpMeds || !!a.medication || !!a.details;
  if (anything && !consent) return { ok: false as const, error: "To keep this information for your instructor we need your consent (tick the box)." };
  await db().from("profiles").update({ parq_completed_at: now }).eq("id", profileId);
  if (!anything) {
    await db().from("health_notes").delete().eq("profile_id", profileId);
    await db().from("health_history").insert({ profile_id: profileId }); // "no injuries or conditions" on this date
    return { ok: true as const };
  }
  const { data: prev } = await db().from("health_notes").select("clearance_received_at").eq("profile_id", profileId).maybeSingle();
  const clearance = needsClearance({ conditions: a.conditions, pregnancy: a.pregnancy, postpartum_months: a.postpartumMonths });
  await db().from("health_notes").upsert({
    profile_id: profileId, conditions: a.conditions, details: a.details, pregnancy: a.pregnancy,
    pregnancy_weeks: a.pregnancyWeeks, postpartum_months: a.postpartumMonths, bp_meds: a.bpMeds, medication: a.medication,
    clearance_needed: clearance, clearance_received_at: clearance ? prev?.clearance_received_at ?? null : null,
    note: null, injuries: null, parq_yes: null, consent_at: now, updated_at: now,
  });
  await db().from("consents").insert({ profile_id: profileId, type: "health_data", granted: true, version } satisfies Consent);
  // A copy of each version, so the studio sees what changed and when.
  await db().from("health_history").insert({
    profile_id: profileId, conditions: a.conditions, details: a.details, pregnancy: a.pregnancy, pregnancy_weeks: a.pregnancyWeeks,
    postpartum_months: a.postpartumMonths, bp_meds: a.bpMeds, medication: a.medication, clearance_needed: clearance,
  });
  return { ok: true as const, clearance };
}
