import { PHOTO_CONSENT } from "@/lib/photo-consent";

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
