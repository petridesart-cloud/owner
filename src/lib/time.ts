// All times are stored in UTC and shown in the studio's timezone. It is fixed to Europe/Nicosia: the
// studio_settings.timezone column is not read anywhere (A-064).
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
const weekdayLong = (v: string | Date) => fWeekdayLong.format(d(v));
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

/** Is it their birthday on this studio date? 29 February birthdays fall on 28 February in other years. */
export function isBirthday(dob: string | null | undefined, key: string) {
  if (!dob) return false;
  const md = dob.slice(5), y = Number(key.slice(0, 4));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return md === key.slice(5) || (md === "02-29" && !leap && key.slice(5) === "02-28");
}

/** Accessible label, e.g. "Monday 13 October, 08:00". */
export const spokenDateTime = (v: string | Date) => `${longDate(v)}, ${time(v)}`;

export function relativeHours(v: string | Date) {
  const mins = Math.round((d(v).getTime() - Date.now()) / 60_000);
  if (mins >= 36 * 60) return `${Math.round(mins / 1440)} days`;
  if (mins < 60) return `${Math.max(mins, 1)} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Convert a studio-local date + "HH:MM" into a UTC ISO string.
 * Around the clock changes: a time that happens twice (autumn) means the first one;
 * a time that doesn't exist (spring, 03:00-03:59) moves forward to the next valid time.
 */
export function localToUtc(dateKey: string, hhmm: string) {
  const guess = new Date(`${dateKey}T${hhmm}:00Z`).getTime(); // the wall-clock time, read as if it were UTC
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: STUDIO_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - ms;
  };
  // The offset just before and just after any change within a day of this time.
  const before = guess - offsetAt(guess - 86_400_000), after = guess - offsetAt(guess + 86_400_000);
  const ok = (t: number) => t + offsetAt(t) === guess;
  const valid = [before, after].filter(ok);
  return new Date(valid.length ? Math.min(...valid) : before).toISOString();
}
export const nowMs = () => Date.now();

/** "13.10.2026" (how she writes dates). */
export function dotDate(v: string | Date) {
  const [yyyy, mm, dd] = dayKey(v).split("-");
  return `${dd}.${mm}.${yyyy}`;
}

/** Last valid day of something that expires at the start of a day. */
export const lastDay = (expiresAt: string) => new Date(new Date(expiresAt).getTime() - 1);

/** "Today", "Tomorrow" or the weekday of a class, by studio calendar day (not by hours from now). */
export function dayWord(v: string | Date, now: Date = new Date()) {
  const k = dayKey(v), t = dayKey(now);
  if (k === t) return "Today";
  if (k === addDaysKey(t, 1)) return "Tomorrow";
  return weekdayLong(v);
}

/** "31.12.2026", "31/12/2026" or "2026-12-31" as a day key, or null if it isn't a real date. */
export function importDateKey(raw: string) {
  const t = raw.trim();
  let y: number, m: number, d: number, x: RegExpMatchArray | null;
  if ((x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) [d, m, y] = [+x[1], +x[2], +x[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** When free cancellation closed: "12:00" today, or "Fri 23:30" on another day (A-028: absolute, never "1 min ago"). */
export function closedAt(cutoffAt: Date, now: Date = new Date()) {
  return dayKey(cutoffAt) === dayKey(now) ? time(cutoffAt) : `${weekdayShort(cutoffAt)} ${time(cutoffAt)}`;
}
