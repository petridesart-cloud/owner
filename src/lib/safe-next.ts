/**
 * Where to send someone after sign-in or a form: only paths on this site.
 * "//evil.com" and "/\evil.com" (browsers read the backslash as a slash) are refused.
 */
export function safeNext(n: string | null | undefined, fallback = "/") {
  const v = String(n ?? "");
  return /^\/(?![/\\])/.test(v) && !/[\\\s\u0000-\u001f]/.test(v) ? v : fallback;
}
