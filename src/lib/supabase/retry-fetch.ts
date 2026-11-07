/**
 * A-055: one retry, after a short random pause, for reads (GET/HEAD) that hit a dropped connection or a
 * 502/503/504. Writes and RPCs (POST) are never retried here: they may already have happened.
 */
export async function retryingFetch(input: RequestInfo | URL, init?: RequestInit, wait = () => 100 + Math.random() * 200): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, init);
  try {
    const res = await fetch(input, init);
    if (![502, 503, 504].includes(res.status)) return res;
  } catch (e) {
    if (init?.signal?.aborted) throw e;
  }
  await new Promise((r) => setTimeout(r, wait()));
  return fetch(input, init);
}
