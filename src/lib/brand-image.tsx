import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Fonts for generated images (icons, Open Graph). OFL-licensed, bundled in src/assets/fonts.
let cache: Promise<{ name: string; data: Buffer; weight: 300 | 400; style: "normal" }[]> | null = null;
export function brandFonts() {
  const dir = join(process.cwd(), "src/assets/fonts");
  cache ??= Promise.all([
    readFile(join(dir, "cormorant-garamond-latin-300-normal.woff")).then((data) => ({ name: "Cormorant", data, weight: 300 as const, style: "normal" as const })),
    readFile(join(dir, "cormorant-garamond-latin-400-normal.woff")).then((data) => ({ name: "Cormorant", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(dir, "pinyon-script-latin-400-normal.woff")).then((data) => ({ name: "Pinyon", data, weight: 400 as const, style: "normal" as const })),
  ]);
  return cache;
}

/** App icon: lilac bloom with the Re·Form wordmark. `inset` shrinks content for maskable icons. */
export function IconArt({ size, inset = 0 }: { size: number; inset?: number }) {
  const s = size * (1 - inset * 2);
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(circle at 50% 85%, #FFFFFF 0%, #E9DDF5 55%, #C9A8E6 100%)" }}>
      <div style={{ display: "flex", fontFamily: "Cormorant", fontWeight: 300, fontSize: s * 0.27, color: "#5B4470", letterSpacing: 1 }}>
        Re·Form
      </div>
    </div>
  );
}
