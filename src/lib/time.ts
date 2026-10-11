// All times are stored in UTC and shown in the studio's timezone.
export const STUDIO_TZ = "Europe/Nicosia";
const LOCALE = "en-GB";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: STUDIO_TZ, ...opts });
const fTime = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fDayKey = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
const fWeekdayShort = fmt({ weekday: "short" });
const fWeekdayLong = fmt({ weekday: "long" });
const fDayMonth = fmt({ day: "numeric", month: "short" });
const fLong = fmt({ weekday: "long", day: "numeric", month: "long" });
const fMonth = fmt({ month: "long", year: "numeric" });

const d = (v: string | Date) => (typeof v === "string" ? new Date(v) : v);

export const time = (v: string | Date) => fTime.format(d(v));
export const weekdayShort = (v: string | Date) => fWeekdayShort.format(d(v));
export const weekdayLong = (v: string | Date) => fWeekdayLong.format(d(v));
export const dayMonth = (v: string | Date) => fDayMonth.format(d(v));
export const longDate = (v: string | Date) => fLong.format(d(v));
export const monthYear = (v: string | Date) => fMonth.format(d(v));

/** "2026-10-12" in studio time — used to group classes by day. */
export function dayKey(v: string | Date) {
  const [dd, mm, yyyy] = fDayKey.format(d(v)).split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** Noon UTC on a day key: a safe Date for formatting that day's label. */
export const keyToDate = (key: string) => new Date(`${key}T12:00:00Z`);

export function addDaysKey(key: string, n: number) {
  const dt = keyToDate(key);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export const todayKey = () => dayKey(new Date());

/** Accessible label, e.g. "Monday 13 October, 08:00". */
export const spokenDateTime = (v: string | Date) => `${longDate(v)}, ${time(v)}`;

export function hoursUntil(v: string | Date) {
  return (d(v).getTime() - Date.now()) / 3_600_000;
}

export function relativeHours(v: string | Date) {
  const mins = Math.round((d(v).getTime() - Date.now()) / 60_000);
  if (mins >= 36 * 60) return `${Math.round(mins / 1440)} days`;
  if (mins < 60) return `${Math.max(mins, 1)} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Convert a studio-local date + "HH:MM" into a UTC ISO string. */
export function localToUtc(dateKey: string, hhmm: string) {
  const guess = new Date(`${dateKey}T${hhmm}:00Z`);
  // Find the offset the studio timezone has at that instant and correct for it.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}
export const nowMs = () => Date.now();
