import { getViewer } from "@/lib/auth";
import { sessionInfo } from "@/lib/booking";
import { buildIcs } from "@/lib/ics";
import { db } from "@/lib/supabase/admin";

// "Add to calendar" for one of the viewer's bookings.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return new Response("Not found", { status: 404 });
  const { data: b } = await db().from("bookings").select("session_id").eq("id", id).eq("profile_id", viewer.profile.id).maybeSingle();
  if (!b) return new Response("Not found", { status: 404 });
  const s = await sessionInfo(b.session_id);
  const ics = buildIcs({ uid: id, title: `${s.name} · Re·Form`, start: s.starts_at, end: s.ends_at, location: s.where, description: "Arrive 5 minutes early. Grip socks recommended." });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="reform-class.ics"` } });
}
