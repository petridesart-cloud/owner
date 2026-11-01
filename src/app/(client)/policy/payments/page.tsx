import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Prose } from "@/components/Prose";
import { PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";

export const metadata: Metadata = { title: "Payments & Cancellation Policy" };

/** Her Payments & Cancellation Policy only, laid out like the Terms. */
export default async function PaymentsPolicyPage() {
  const [s, t] = await Promise.all([getSettings(), getTexts()]);
  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle eyebrow="Re·Form" title="Payments & Cancellation" />
      <Prose>
        <ul>{t.payments_policy.map((r) => <li key={r}>{r}</li>)}</ul>
        <p>Cancel or reschedule in the app up to {s.cancellation_cutoff_hours} hours before class and your class goes back into your package.</p>
        <p className="mt-5 text-sm text-ink-soft">
          See also the <Link href="/policy">Studio Rules</Link> and the <Link href="/legal/terms">Terms &amp; Conditions</Link>.
        </p>
      </Prose>
    </div>
  );
}
