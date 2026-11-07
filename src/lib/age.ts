// Ages in whole years on a calendar day (studio time), without server-only imports so they can be unit-tested.
// Someone born on 29 February turns a year older on 1 March in other years (A-062).

/** Age in whole years on `on` (YYYY-MM-DD). */
export function ageOn(dob: string, on: string) {
  const [y, m, d] = dob.split("-").map(Number);
  const [Y, M, D] = on.split("-").map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}

/** 18 or over on that day: classes are for adults (her answer, round 4). */
export const isAdult = (dob: string, on: string) => ageOn(dob, on) >= 18;
