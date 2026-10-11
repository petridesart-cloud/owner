"use client";
import { useState } from "react";
import { MapPin } from "lucide-react";

// No third-party request until the visitor opts in (ePrivacy): Google Maps sets cookies.
export function ClickToLoadMap({ query, address }: { query: string; address: string }) {
  const [loaded, setLoaded] = useState(false);
  if (loaded) {
    return (
      <iframe
        title={`Map showing ${address}`}
        src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
        className="h-64 w-full rounded-[var(--radius-card)] border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }
  return (
    <div className="card flex h-64 flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#efe6f8_25%,#f6f0fb_25%,#f6f0fb_50%,#efe6f8_50%,#efe6f8_75%,#f6f0fb_75%)] bg-[length:24px_24px] px-6 text-center">
      <MapPin aria-hidden className="text-plum-700" />
      <p className="text-sm font-medium text-ink">{address}</p>
      <p className="max-w-xs text-xs leading-relaxed text-ink-soft">Loading the map connects to Google, which may set cookies. <a href="/legal/cookies" className="underline underline-offset-4">Cookies policy</a></p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={() => setLoaded(true)} className="min-h-11 rounded-full bg-ink px-5 text-xs font-medium uppercase tracking-[0.16em] text-paper">Load map</button>
        <a href={`https://maps.google.com/?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-5 text-xs font-medium uppercase tracking-[0.16em] text-ink">Open in Maps</a>
      </div>
    </div>
  );
}
