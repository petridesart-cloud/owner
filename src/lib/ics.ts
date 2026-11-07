// Minimal RFC 5545 calendar file for "Add to calendar".
const stamp = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) =>
  s.replace(/\r\n?/g, "\n").replace(/\r/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fold a content line at 75 octets (continuation lines start with a space), never inside a character. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = out.length ? 74 : 75; // continuation lines carry a leading space
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// SEQUENCE grows with every download (seconds since 2026), so a calendar that imports the file again
// takes a moved or cancelled class as the newer version. There is no updated_at on sessions.
const SEQ_BASE = Date.UTC(2026, 0, 1);

export function buildIcs(
  e: { uid: string; title: string; start: string; end: string; location?: string | null; description?: string; cancelled?: boolean },
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Re-Form Pilates//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@reform-pilates`,
    `DTSTAMP:${stamp(now)}`,
    `SEQUENCE:${Math.max(0, Math.floor((now.getTime() - SEQ_BASE) / 1000))}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : "",
    e.description ? `DESCRIPTION:${esc(e.description)}` : "",
    ...(e.cancelled ? [] : ["BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.filter(Boolean).map(fold).join("\r\n");
}
