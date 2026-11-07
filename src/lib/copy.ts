// Small copy helpers shared by pages and emails (pure; no database).

/** The closing line for someone who is booked: matches the class (A-073). */
export function seeYou(kind: string | null | undefined) {
  return kind === "event" ? "See you there!" : kind === "mat" ? "See you on the mat." : kind === "reformer" ? "See you on the reformer." : "See you soon.";
}

/** "24 hours and 2 hours": when reminders go out, from the Settings list of minutes (A-073). */
export function reminderWhen(offsets: number[]) {
  const word = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minute${m === 1 ? "" : "s"}`);
  const list = [...offsets].sort((a, b) => b - a).map(word);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0] ?? "";
}

/** "1 month" / "2 months". */
export const monthsLabel = (m: number) => `${m} month${m === 1 ? "" : "s"}`;
