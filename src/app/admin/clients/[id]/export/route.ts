import { getViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { exportProfile } from "@/lib/export";

// A-059: the studio downloads everything held about one client (for a request by DM or email, or a
// client without a login). Route handlers aren't covered by the admin layout, so check the role here.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (viewer?.profile.role !== "admin") return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const body = await exportProfile(id);
  if (!body) return new Response("Not found", { status: 404 });
  // Who exported whom, without personal data.
  await db().from("audit_log").insert({ actor_profile_id: viewer.profile.id, action: "export_client", details: { profileId: id } });
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="reform-client-${id.slice(0, 8)}.json"`, "Cache-Control": "no-store" },
  });
}
