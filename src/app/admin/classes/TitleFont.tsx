"use client";
import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { EVENT_FONTS, eventTitleClass } from "@/lib/event-font";

/** Event title font, with a live preview of her title. */
export function TitleFont({ value, title }: { value?: string | null; title?: string | null }) {
  const [font, setFont] = useState(value ?? "calligraphy");
  return (
    <div className="space-y-2">
      <Field id="title_font" label="Title font" hint="How the event's name looks on the Events page and the event page.">
        <select id="title_font" name="title_font" value={font} onChange={(e) => setFont(e.target.value)} className={inputClass}>
          {EVENT_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </Field>
      <p aria-hidden className={`rounded-2xl bg-lilac-50 px-4 py-3 text-ink ${eventTitleClass(font)}`}>{title || "Brunch & Pilates"}</p>
    </div>
  );
}
