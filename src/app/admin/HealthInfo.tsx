import { HeartPulse } from "lucide-react";

type H = { note?: string | null; injuries?: string | null; medication?: string | null } | null | undefined;

/** Health info (instructor only), collapsed behind a tap. */
export function HealthInfo({ h, label = "Health info" }: { h: H; label?: string }) {
  if (!h || !(h.note || h.injuries || h.medication)) return null;
  return (
    <details className="mt-1 text-xs text-burgundy">
      <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 font-medium"><HeartPulse aria-hidden size={13} /> {label}</summary>
      <div className="space-y-0.5 pb-1 text-ink">
        {(h.injuries || h.note) && <p><span className="font-medium">Injuries:</span> {h.injuries ?? h.note}</p>}
        {h.medication && <p><span className="font-medium">Medication:</span> {h.medication}</p>}
      </div>
    </details>
  );
}
