import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Prose } from "@/components/Prose";
import { PageTitle } from "@/components/ui";
import { getTexts } from "@/lib/content";

export const metadata: Metadata = { title: "Studio Rules" };

/** Her Studio Rules only, laid out like the Terms (her note: plain, no flowers). */
export default async function StudioRulesPage() {
  const t = await getTexts();
  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle eyebrow="Re·Form" title="Studio Rules" />
      <Prose>
        <ul>{t.studio_rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-5 text-sm text-ink-soft">
          See also the <Link href="/policy/payments">Payments &amp; Cancellation Policy</Link> and the <Link href="/legal/terms">Terms &amp; Conditions</Link>.
        </p>
      </Prose>
    </div>
  );
}
