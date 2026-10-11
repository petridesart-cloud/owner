import { ImageResponse } from "next/og";
import { brandFonts, IconArt } from "@/lib/brand-image";

// /pwa-icon/192, /pwa-icon/512, /pwa-icon/maskable (512, safe-zone padded), /pwa-icon/apple (180)
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "apple" ? 180 : size === "192" ? 192 : 512;
  const inset = size === "maskable" ? 0.1 : 0;
  return new ImageResponse(<IconArt size={px} inset={inset} />, {
    width: px, height: px, fonts: await brandFonts(),
    headers: { "Cache-Control": "public, max-age=86400, immutable" },
  });
}
