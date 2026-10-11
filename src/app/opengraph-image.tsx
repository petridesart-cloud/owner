import { ImageResponse } from "next/og";
import { brandFonts } from "@/lib/brand-image";

export const alt = "Re·Form Pilates Studio, Limassol: Reformer & Mat Pilates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(120% 90% at 50% 100%, #FFFFFF 0%, #EFE6F8 45%, #D9C3EE 100%)", color: "#2E2238" }}>
        <div style={{ display: "flex", width: 230, height: 230, borderRadius: 999, alignItems: "center", justifyContent: "center",
          background: "radial-gradient(circle at 50% 85%, #FFFFFF 0%, #E9DDF5 55%, #C9A8E6 100%)", boxShadow: "0 20px 60px rgba(46,34,56,0.18)" }}>
          <div style={{ fontFamily: "Cormorant", fontWeight: 300, fontSize: 62, color: "#5B4470" }}>Re·Form</div>
        </div>
        <div style={{ marginTop: 44, fontFamily: "Cormorant", fontSize: 44, letterSpacing: 10 }}>PILATES STUDIO · LIMASSOL</div>
        <div style={{ marginTop: 14, fontFamily: "Pinyon", fontSize: 54, color: "#4A3759" }}>Secure your spot</div>
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
