/** Her choice of title font per event (round 5): the class and a size that suits it. */
export const EVENT_FONTS = [
  { value: "calligraphy", label: "Calligraphy" },
  { value: "handwritten", label: "Handwritten" },
  { value: "minimal", label: "Minimal" },
  { value: "simple", label: "Simple" },
  { value: "elegant", label: "Elegant" },
  { value: "bold", label: "Bold" },
] as const;
export type EventFont = (typeof EVENT_FONTS)[number]["value"];

const SIZE: Record<EventFont, string> = {
  calligraphy: "text-[2.4rem] leading-none", handwritten: "text-[2.3rem] leading-none", minimal: "text-[1.3rem] leading-snug",
  simple: "text-[1.65rem] leading-tight", elegant: "text-[1.7rem] leading-tight", bold: "text-[2rem] leading-none",
};

/** Default: calligraphy (how events have always looked). */
export function eventTitleClass(font: string | null | undefined, scale: "card" | "page" = "card") {
  const f = (EVENT_FONTS.some((x) => x.value === font) ? font : "calligraphy") as EventFont;
  const size = scale === "page" && f === "calligraphy" ? "text-[2.6rem] leading-none" : SIZE[f];
  return `title-${f} ${size}`;
}
