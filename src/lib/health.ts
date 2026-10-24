// Health questions (round 2): what clients tick, and when a doctor's note is needed.
export const CONDITIONS = [
  { key: "back", label: "Back pain" },
  { key: "neck", label: "Neck pain / injury" },
  { key: "shoulder", label: "Shoulder pain / injury" },
  { key: "hip", label: "Hip pain / injury" },
  { key: "knee", label: "Knee pain / injury" },
  { key: "ankle", label: "Ankle pain / injury" },
  { key: "spinal", label: "Spinal injury" },
  { key: "joint", label: "Joint pain" },
  { key: "arthritis", label: "Arthritis" },
  { key: "scoliosis", label: "Scoliosis" },
  { key: "lordosis", label: "Lordosis" },
  { key: "osteoporosis", label: "Osteoporosis / bone conditions" },
  { key: "surgery", label: "Recent surgery (last 12 months)" },
  { key: "pregnancy", label: "Pregnancy (current or past)" },
  { key: "cardio", label: "Cardiovascular issues (e.g. high blood pressure, heart condition)" },
  { key: "chest_dizzy", label: "Chest pain, dizziness or fainting" },
  { key: "autoimmune", label: "Autoimmune disease" },
  { key: "other", label: "Other injuries or conditions" },
] as const;
export type ConditionKey = (typeof CONDITIONS)[number]["key"];
export const conditionLabel = (k: string) => CONDITIONS.find((c) => c.key === k)?.label ?? k;

/** How long ago they gave birth, stored in months. */
export const POSTPARTUM = [
  { months: 0, label: "Less than a month ago" },
  { months: 1, label: "1 month ago" },
  { months: 2, label: "2 months ago" },
  { months: 3, label: "3 months ago" },
  { months: 5, label: "4–6 months ago" },
  { months: 9, label: "6–12 months ago" },
  { months: 13, label: "More than a year ago" },
] as const;

/** Her rule: currently pregnant, birth within 3 months, or surgery in the last 12 months → doctor's note. */
export function needsClearance(h: { conditions?: string[] | null; pregnancy?: string | null; postpartum_months?: number | null }) {
  const c = h.conditions ?? [];
  return c.includes("surgery") || (c.includes("pregnancy") && (h.pregnancy === "current" || (h.pregnancy === "past" && (h.postpartum_months ?? 99) <= 3)));
}
