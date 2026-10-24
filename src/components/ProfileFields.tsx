import { PHOTO_CONSENT } from "@/lib/photo-consent";
import { Checkbox, Field, inputClass } from "./ui";

/** Injuries + medication, with the separate explicit consent health data needs. */
export function HealthFields({ injuries = "", medication = "", consented = false, error }: { injuries?: string; medication?: string; consented?: boolean; error?: string }) {
  return (
    <div className="space-y-3">
      <Field id="injuries" label="Injuries or conditions" hint="e.g. recovering from a knee injury, pregnancy, back pain. Leave empty if none.">
        <textarea id="injuries" name="injuries" rows={2} defaultValue={injuries} className={`${inputClass} py-3`} />
      </Field>
      <Field id="medication" label="Medication" hint="Anything your instructor should know about. Leave empty if none.">
        <textarea id="medication" name="medication" rows={2} defaultValue={medication} className={`${inputClass} py-3`} />
      </Field>
      <Checkbox id="health_consent" name="health_consent" defaultChecked={consented} aria-describedby={error ? "health_consent-error" : undefined}>
        I consent to Re·Form storing this health information so my instructor can adapt exercises for me. Only my instructor sees it, and I can delete it any time.
      </Checkbox>
      {error && <p id="health_consent-error" className="text-xs font-medium text-burgundy">{error}</p>}
    </div>
  );
}

export function PhotoConsentField({ value }: { value?: string | null }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink">Photos &amp; videos for social media</legend>
      <p className="mb-2 text-xs leading-relaxed text-ink-soft">Sometimes we share class moments on Instagram. Change your choice any time.</p>
      <div className="space-y-1.5">
        {Object.entries(PHOTO_CONSENT).map(([k, label]) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-4 text-sm text-ink has-[:checked]:border-plum-700 has-[:checked]:bg-lilac-50">
            <input type="radio" name="photo_consent" value={k} defaultChecked={value === k} className="size-4 accent-ink" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
