// PAR-Q (Physical Activity Readiness Questionnaire), plus pregnancy for Pilates.
export const PARQ = [
  { key: "heart", text: "Has a doctor ever said you have a heart condition and should only do physical activity recommended by a doctor?" },
  { key: "chest_active", text: "Do you feel pain in your chest when you do physical activity?" },
  { key: "chest_rest", text: "In the past month, have you had chest pain when you were not doing physical activity?" },
  { key: "dizzy", text: "Do you lose your balance because of dizziness, or do you ever lose consciousness?" },
  { key: "joints", text: "Do you have a bone or joint problem (for example back, knee or hip) that could be made worse by exercise?" },
  { key: "bp_meds", text: "Is a doctor currently prescribing medication for your blood pressure or a heart condition?" },
  { key: "pregnant", text: "Are you pregnant, or have you given birth in the last 6 months?" },
  { key: "other", text: "Do you know of any other reason why you should not do physical activity?" },
] as const;
export type ParqKey = (typeof PARQ)[number]["key"];
export const parqText = (k: string) => PARQ.find((q) => q.key === k)?.text ?? k;

/** Read answers from a form: every question must be "yes" or "no". */
export function readParq(form: FormData): { ok: true; yes: ParqKey[] } | { ok: false; missing: number } {
  const yes: ParqKey[] = [];
  let missing = 0;
  for (const q of PARQ) {
    const v = form.get(`parq_${q.key}`);
    if (v === "yes") yes.push(q.key);
    else if (v !== "no") missing++;
  }
  return missing ? { ok: false, missing } : { ok: true, yes };
}
