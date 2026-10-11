import { ImageResponse } from "next/og";
import { brandFonts } from "@/lib/brand-image";
import { db } from "@/lib/supabase/admin";
import { longDate, time } from "@/lib/time";

export const alt = "A class at Re·Form Pilates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link preview for a shared class (Instagram / WhatsApp DMs). No personal data.
export default async function ClassOG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: s } = /^[0-9a-f-]{36}$/.test(id)
    ? await db().from("class_sessions").select("starts_at, title, location, class_types(name, kind)").eq("id", id).maybeSingle()
    : { data: null };
  const name = s?.title ?? s?.class_types?.name ?? "Reformer Pilates";
  const isReformer = s?.class_types?.kind === "reformer";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72,
        background: "linear-gradient(160deg, #E9DDF5 0%, #F3EBFA 50%, #FBF8FC 100%)", color: "#2E2238" }}>
        <div style={{ display: "flex", fontFamily: "Cormorant", fontWeight: 300, fontSize: 52, color: "#5B4470" }}>Re·Form</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            {isReformer ? (
              <>
                <span style={{ fontFamily: "Pinyon", fontSize: 110, color: "#4A3759" }}>Reformer</span>
                <span style={{ fontFamily: "Cormorant", fontSize: 76, letterSpacing: 8 }}>PILATES</span>
              </>
            ) : (
              <span style={{ fontFamily: "Pinyon", fontSize: 110, color: "#4A3759" }}>{name}</span>
            )}
          </div>
          {s && <div style={{ marginTop: 18, fontFamily: "Cormorant", fontSize: 50, letterSpacing: 4 }}>{longDate(s.starts_at).toUpperCase()} · {time(s.starts_at)}</div>}
          <div style={{ marginTop: 10, fontFamily: "Cormorant", fontSize: 36, color: "#5E5566" }}>{s?.location ?? "Re·Form Studio, Limassol"}</div>
        </div>
        <div style={{ display: "flex", alignSelf: "flex-start", padding: "16px 34px", borderRadius: 999, background: "#2E2238", color: "#FBF8FC", fontFamily: "Cormorant", fontSize: 32, letterSpacing: 6 }}>
          SECURE YOUR SPOT
        </div>
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
