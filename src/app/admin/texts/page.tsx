import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";
import { saveTexts } from "../actions";
import { db } from "@/lib/supabase/admin";
import { defaultTerms } from "@/lib/terms";
import { waiverText } from "@/lib/legal";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

export default async function TextsPage() {
  const [t, s, { data: terms }, { data: waiver }] = await Promise.all([getTexts(), getSettings(),
    db().from("site_content").select("value").eq("key", "terms").maybeSingle(), db().from("site_content").select("value").eq("key", "waiver").maybeSingle()]);
  const area = (id: string, label: string, value: string, hint: string, rows = 6) => (
    <Field id={id} label={label} hint={hint}>
      <textarea id={id} name={id} rows={rows} defaultValue={value} className={`${inputClass} py-3 leading-relaxed`} />
    </Field>
  );
  return (
    <div>
      <AdminTitle back="/admin/settings" title="Your texts" sub="Edit the words clients see. Changes go live when you save." />
      <div className="card px-5 py-5">
        <ActionForm action={saveTexts} submit="Save texts">
          <Field id="intro_line" label="Home page intro" hint="One short sentence under your logo.">
            <input id="intro_line" name="intro_line" defaultValue={s.intro_line} className={inputClass} />
          </Field>
          {area("studio_rules", "Studio Rules", t.studio_rules.join("\n"), "One rule per line.", 7)}
          {area("payments_policy", "Payments & Cancellation Policy", t.payments_policy.join("\n"), "One point per line. Keep the rules in Settings (cutoff hours, discount) matching what you write here.", 12)}
          {area("what_to_bring", "What to bring", t.what_to_bring.join("\n"), "One item per line. Shown on every class.", 4)}
          {area("studio_text", "The Studio (optional)", t.studio_text, "A few words under your studio photos. Leave an empty line between paragraphs; leave it all empty to show only the photos.", 3)}
          {area("events_intro", "Events intro (optional)", t.events_intro, "One line under the Events title. Leave empty to hide.", 2)}
          {area("terms", "Terms & Conditions", terms?.value || defaultTerms(s), "Start a line with ## for a heading and - for a bullet point. Empty it and save to go back to our default (which follows your settings).", 16)}
          {area("waiver", "Health & Safety (accepted at sign-up)", waiver?.value || waiverText(s), "Same format as the Terms. Empty it and save to go back to our default. Clients who sign up after a change accept the new version.", 12)}
        </ActionForm>
      </div>
    </div>
  );
}
