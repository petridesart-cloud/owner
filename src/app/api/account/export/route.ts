import { getViewer } from "@/lib/auth";
import { exportProfile } from "@/lib/export";
import { rateLimited } from "@/lib/rate-limit";

// GDPR art. 15/20: everything we hold about the signed-in client, as JSON (A-063).
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  if (await rateLimited("export", viewer.profile.id, 5, 60)) return new Response("Too many downloads. Please try again in an hour.", { status: 429 });
  const body = await exportProfile(viewer.profile.id);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="reform-my-data.json"', "Cache-Control": "no-store" },
  });
}
