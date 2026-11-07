// Small copy helpers shared by pages and emails (pure; no database).

/** The closing line for someone who is booked: matches the class (A-073). */
export function seeYou(kind: string | null | undefined) {
  return kind === "event" ? "See you there!" : kind === "mat" ? "See you on the mat." : kind === "reformer" ? "See you on the reformer." : "See you soon.";
}

/** "1 class" / "3 classes". */
export const classesWord = (n: number) => `${n} class${n === 1 ? "" : "es"}`;
