// What a photo really is, from its first bytes (A-093): JPEG FF D8 FF, PNG 89 50 4E 47 0D 0A 1A 0A,
// WebP "RIFF" ···· "WEBP". Anything else (SVG, HTML, a renamed file) is refused.
export function sniffImage(b: Uint8Array): { ext: "jpg" | "png" | "webp"; type: string } | null {
  const at = (i: number, ...n: number[]) => b.length >= i + n.length && n.every((v, k) => b[i + k] === v);
  if (at(0, 0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", type: "image/png" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { ext: "webp", type: "image/webp" };
  return null;
}
