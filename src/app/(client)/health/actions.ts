"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, requireViewer } from "@/lib/auth";
import { CONDITIONS, POSTPARTUM } from "@/lib/health";
import { saveHealthAnswers } from "@/lib/profile";

export type HealthState = { ok: boolean; error?: string };
const KEYS = new Set<string>(CONDITIONS.map((c) => c.key));

export async function saveHealth(_: HealthState, form: FormData): Promise<HealthState> {
  const viewer = await requireViewer("/health");
  const settings = await getSettings();
  const none = form.get("none") === "on";
  const conditions = none ? [] : form.getAll("condition").map(String).filter((k) => KEYS.has(k));
  if (!none && !conditions.length) return { ok: false, error: "Please tick what applies to you, or “No injuries or medical conditions”." };
  const bp = form.get("bp_meds");
  if (bp !== "yes" && bp !== "no") return { ok: false, error: "Please answer the question about blood pressure or heart medication." };

  let pregnancy: "current" | "past" | null = null, pregnancyWeeks: number | null = null, postpartumMonths: number | null = null;
  if (conditions.includes("pregnancy")) {
    const p = form.get("pregnancy");
    if (p === "current") {
      pregnancy = "current";
      pregnancyWeeks = Number(form.get("pregnancy_weeks"));
      if (!Number.isInteger(pregnancyWeeks) || pregnancyWeeks < 1 || pregnancyWeeks > 45) return { ok: false, error: "How many weeks along are you? (a number between 1 and 45)" };
    } else if (p === "past") {
      pregnancy = "past";
      postpartumMonths = Number(form.get("postpartum_months"));
      if (!POSTPARTUM.some((o) => o.months === postpartumMonths)) return { ok: false, error: "How long ago did you give birth?" };
    } else return { ok: false, error: "Is the pregnancy current or in the past?" };
  }

  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const res = await saveHealthAnswers(viewer.profile.id, {
    conditions, details: text("details", 1500), pregnancy, pregnancyWeeks, postpartumMonths,
    bpMeds: bp === "yes", medication: text("medication", 500),
  }, form.get("health_consent") === "on", settings.policy_version);
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/account");
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/account?health=saved");
}
