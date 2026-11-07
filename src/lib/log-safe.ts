/**
 * A-056: logs carry codes and ids, never personal data. Provider error bodies can echo an address or a phone
 * number, so email addresses and long digit runs are masked and the text is cut short.
 */
export function redact(text: string, max = 200) {
  return text
    .replace(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .slice(0, max);
}

/** An error as one safe line for the log. */
export const safeError = (e: unknown) => redact(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
