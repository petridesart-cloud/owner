// A typed search term made safe for a PostgREST `or=(…ilike.%term%…)` filter: commas, parentheses,
// quotes, backslashes and wildcards would break or extend the filter, so they become spaces.
export function searchTerm(q: string) {
  return q.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
