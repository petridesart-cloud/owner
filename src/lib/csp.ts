// Content-Security-Policy (A-043), sent by the proxy with a fresh nonce per request. Next.js reads the
// nonce from the request header and puts it on its own scripts. Delivered as Report-Only for now, so
// frame-ancestors (X-Frame-Options DENY covers it) and upgrade-insecure-requests (HSTS) are left out:
// browsers ignore them in Report-Only and warn in the console.
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

export function buildCsp(nonce: string, o: { supabaseUrl?: string; dev: boolean }) {
  let supabase = "";
  try { supabase = o.supabaseUrl ? new URL(o.supabaseUrl).origin : ""; } catch { supabase = ""; }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://www.google.com https://maps.google.com", // the click-to-load map only
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "report-uri /api/csp-report",
  ].join("; ");
}
