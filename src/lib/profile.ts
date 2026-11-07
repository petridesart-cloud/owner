import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { HEALTH_CONSENT_VERSION, needsClearance, needsHealthConsent } from "@/lib/health";
import { todayKey } from "@/lib/time";
import { ageOn as ageOnDay, isAdult } from "@/lib/age";

export { PHOTO_CONSENT, type PhotoConsent } from "@/lib/photo-consent";

export const nameSchema = z.string().trim().min(1, "Please fill this in.").max(60);
export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Please enter a valid phone number, e.g. +357 99 123456.");
// Required (her answer, round 1). Clients are 18 or over (her answer, round 4).
// A-062: checked on the studio's calendar day (not the UTC date), and 29 February birthdays count from 1 March.
export const dobSchema = z.string({ error: "Please add your date of birth." }).trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please add your date of birth.")
  .refine((d) => !Number.isNaN(Date.parse(d)) && ageOn(d) <= 100 && ageOn(d) >= 0, "Please check the date.")
  .refine((d) => isAdult(d, todayKey()), "Classes are for adults: you need to be 18 or over.");

/** Age in whole years on a given day (default today, studio time). */
export const ageOn = (dob: string, on = todayKey()) => ageOnDay(dob, on);

export const fullName = (first: string, last: string) => `${first} ${last}`.trim();

export type HealthAnswers = {
  conditions: string[]; details: string | null; pregnancy: "current" | "past" | null;
  pregnancyWeeks: number | null; postpartumMonths: number | null; bpMeds: boolean; medication: string | null;
};

/**
 * Health questions v2, saved in one transaction (`save_health_answers`; `parq_completed_at` last).
 * The answers are health data: stored (instructor-only) only with explicit consent, which is needed
 * whenever there is something to store (`needsHealthConsent`). "No conditions" and "I'll tell my
 * instructor in person" store nothing and remove any earlier answers and their history.
 */
export async function saveHealthAnswers(profileId: string, a: HealthAnswers | "in_person", consent: boolean) {
  const mode = a === "in_person" ? "in_person" : needsHealthConsent(a) ? "answers" : "none";
  const clearance = a !== "in_person" && mode === "answers" && needsClearance({ conditions: a.conditions, pregnancy: a.pregnancy, postpartum_months: a.postpartumMonths });
  const answers = a === "in_person" || mode !== "answers" ? null : {
    conditions: a.conditions, details: a.details, pregnancy: a.pregnancy, pregnancy_weeks: a.pregnancyWeeks,
    postpartum_months: a.postpartumMonths, bp_meds: a.bpMeds, medication: a.medication, clearance_needed: clearance,
  };
  const { error } = await db().rpc("save_health_answers", {
    p_profile: profileId, p_mode: mode, p_answers: answers as never, p_consent: consent, p_version: HEALTH_CONSENT_VERSION,
  });
  if (error?.message === "health_consent_required") return { ok: false as const, error: "To keep this information for your instructor we need your consent (tick the box)." };
  if (error) return { ok: false as const, error: "We couldn't save your answers. Please try again." };
  return { ok: true as const, clearance, mode };
}

/** Account → Health → "Delete my health information": answers and history deleted, consent withdrawn. */
export async function withdrawHealthConsent(profileId: string) {
  const { data, error } = await db().rpc("withdraw_health_consent", { p_profile: profileId, p_version: HEALTH_CONSENT_VERSION });
  return error ? { ok: false as const } : { ok: true as const, removed: !!data };
}
