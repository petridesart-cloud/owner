// Collects Content-Security-Policy (Report-Only) violation reports into the server log, so they can be
// checked before the policy is enforced. Nothing is stored.
export async function POST(req: Request) {
  const text = (await req.text().catch(() => "")).slice(0, 2000);
  if (text) console.warn("csp-report", text);
  return new Response(null, { status: 204 });
}
