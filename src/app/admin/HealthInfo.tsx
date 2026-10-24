import { HeartPulse } from "lucide-react";
import { parqText } from "@/lib/parq";
import { POSTPARTUM, conditionLabel } from "@/lib/health";
import { dotDate } from "@/lib/time";

type H = {
  note?: string | null; injuries?: string | null; medication?: string | null; parq_yes?: string[] | null;
  conditions?: string[] | null; details?: string | null; pregnancy?: string | null; pregnancy_weeks?: number | null;
  postpartum_months?: number | null; bp_meds?: boolean | null; clearance_needed?: boolean | null; clearance_received_at?: string | null;
} | null | undefined;

export const hasHealth = (h: H) => !!h && !!(h.note || h.injuries || h.medication || h.parq_yes?.length || h.conditions?.length || h.details || h.bp_meds);

/** Health info (instructor only), collapsed behind a tap. */
export function HealthInfo({ h, label = "Health info", open = false }: { h: H; label?: string; open?: boolean }) {
  if (!h || !hasHealth(h)) return null;
  return (
    <details className="mt-1 text-xs text-burgundy" open={open}>
      <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 font-medium"><HeartPulse aria-hidden size={13} /> {label}</summary>
      <div className="space-y-1 pb-1 text-ink">
        {!!h.conditions?.length && <p><span className="font-medium">Ticked:</span> {h.conditions.map(conditionLabel).join(", ")}</p>}
        {h.pregnancy && <p><span className="font-medium">Pregnancy:</span> {h.pregnancy === "current" ? `currently ${h.pregnancy_weeks} weeks` : `gave birth ${POSTPARTUM.find((o) => o.months === h.postpartum_months)?.label.toLowerCase() ?? ""}`}</p>}
        {(h.details || h.injuries || h.note) && <p><span className="font-medium">Details:</span> {h.details ?? h.injuries ?? h.note}</p>}
        {h.bp_meds != null && <p><span className="font-medium">Blood pressure / heart medication:</span> {h.bp_meds ? "yes" : "no"}</p>}
        {h.medication && <p><span className="font-medium">Medication:</span> {h.medication}</p>}
        {h.clearance_needed && <p className="font-medium">{h.clearance_received_at ? `Doctor's note received ${dotDate(h.clearance_received_at)}` : "Doctor's note needed before class"}</p>}
        {!!h.parq_yes?.length && (
          <div><p className="font-medium">Earlier PAR-Q, answered yes:</p><ul className="list-disc pl-4">{h.parq_yes.map((k) => <li key={k}>{parqText(k)}</li>)}</ul></div>
        )}
      </div>
    </details>
  );
}
