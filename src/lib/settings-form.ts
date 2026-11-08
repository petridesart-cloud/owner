import { z } from "zod";

/**
 * A-065: the numbers on the Settings form. An empty box keeps the value that is saved (clearing a field must never
 * turn her 6-hour rule into 0), and a value outside its range is refused with that field's name and range.
 */
export const NUMBER_FIELDS = {
  cancellation_cutoff_hours: { label: "Free cancellation (hours before)", min: 1, max: 168, int: true },
  waitlist_window_hours: { label: "Waitlist claim window (hours)", min: 0.25, max: 72, int: false },
  waitlist_close_minutes: { label: "Waitlist stops (minutes before class)", min: 0, max: 720, int: true },
  hold_minutes: { label: "Online payment hold (minutes)", min: 1, max: 1440, int: true },
  rollover_max: { label: "Classes rolling over", min: 0, max: 50, int: true },
  unpaid_request_expiry_hours: { label: "Unpaid requests expire (hours)", min: 1, max: 720, int: true },
  expiry_reminder_days: { label: "Remind before package expires (days)", min: 0, max: 60, int: true },
  student_discount_pct: { label: "Student discount (%)", min: 0, max: 100, int: true },
  booking_window_weeks: { label: "Clients can book (weeks ahead)", min: 1, max: 26, int: true },
  // Her data-keeping choices (owner's request, 8 Nov): the Privacy Policy follows them. Payments: 6 years minimum (tax law).
  retention_health_months: { label: "Keep health answers (months after last class)", min: 1, max: 60, int: true },
  retention_inactive_months: { label: "Erase inactive accounts after (months)", min: 6, max: 120, int: true },
  retention_payments_years: { label: "Keep payments and package records (years)", min: 6, max: 10, int: true },
} as const;
export type NumberField = keyof typeof NUMBER_FIELDS;

export function parseSettingsNumbers(
  get: (key: string) => string | null | undefined,
  current: Record<NumberField, number>,
): { ok: true; values: Record<NumberField, number> } | { ok: false; errors: Partial<Record<NumberField, string>> } {
  const values = { ...current };
  const errors: Partial<Record<NumberField, string>> = {};
  for (const k of Object.keys(NUMBER_FIELDS) as NumberField[]) {
    const f = NUMBER_FIELDS[k];
    const raw = String(get(k) ?? "").trim().replace(",", ".");
    if (raw === "") continue; // empty: keep what is saved
    const schema = (f.int ? z.number().int() : z.number()).min(f.min).max(f.max);
    const r = schema.safeParse(Number(raw));
    if (r.success) values[k] = r.data;
    else errors[k] = `${f.label}: ${f.int ? "a whole number" : "a number"} from ${f.min} to ${f.max}`;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
