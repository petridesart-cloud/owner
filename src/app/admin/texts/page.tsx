import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";
import { saveTexts } from "../actions";
import { AdminTitle } from "../ui";

export const dynamic = "force-dynamic";

export default async function TextsPage() {
  const [t, s] = await Promise.all([getTexts(), getSettings()]);
  const area = (id: string, label: string, value: string, hint: string, rows = 6) => (
    <Field id={id} label={label} hint={hint}>
      <textarea id={id} name={id} rows={rows} defaultValue={value} className={`${inputClass} py-3 leading-relaxed`} />
    </Field>
  );
  return (
    <div>
      <AdminTitle title="Your texts" sub="Edit the words clients see. Changes go live when you save." />
      <div className="card px-5 py-5">
        <ActionForm action={saveTexts} submit="Save texts">
          <Field id="intro_line" label="Home page intro" hint="One short sentence under your logo.">
            <input id="intro_line" name="intro_line" defaultValue={s.intro_line} className={inputClass} />
          </Field>
          {area("studio_rules", "Studio Rules", t.studio_rules.join("\n"), "One rule per line. Shown with the little flower.", 7)}
          {area("payments_policy", "Payments, Cancellation & Membership Policy", t.payments_policy.join("\n"), "One point per line. Keep the rules in Settings (cutoff hours, discount) matching what you write here.", 12)}
          {area("what_to_bring", "What to bring", t.what_to_bring.join("\n"), "One item per line. Shown on every class.", 4)}
          {area("magic_text", "The Magic (about you, on the Studio page)", t.magic_text, "Leave an empty line between paragraphs.", 8)}
          {area("studio_text", "Studio page intro", t.studio_text, "A sentence or two about the space.", 3)}
        </ActionForm>
      </div>
    </div>
  );
}
