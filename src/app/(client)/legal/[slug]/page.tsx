import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { MarkedText } from "@/lib/terms";
import { notFound, redirect } from "next/navigation";
import { Prose } from "@/components/Prose";
import { PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { DOC_TITLE, accessibilityText, type LegalDoc } from "@/lib/legal";
import { currentVersion, docText } from "@/lib/policy-versions";
import { longDate } from "@/lib/time";

// The legal pages (A-013, A-104). Each text comes from src/lib/legal.ts or her editable Terms, follows her settings,
// and is the same text docs/*.md is generated from. Versioned documents show the version a client accepts.
const PAGES: Record<string, LegalDoc | "accessibility"> = {
  terms: "terms",
  privacy: "privacy",
  cookies: "cookies",
  health: "waiver",
  accessibility: "accessibility",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = PAGES[slug];
  return { title: doc ? DOC_TITLE[doc] : "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "cancellation") redirect("/policy/payments"); // her own policy page replaces it
  const doc = PAGES[slug];
  if (!doc) notFound();
  const [text, version] = doc === "accessibility"
    ? [accessibilityText(await getSettings()), null]
    : await Promise.all([docText(doc), currentVersion(doc)]);
  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle eyebrow="Legal" title={DOC_TITLE[doc]} />
      <Prose>
        <MarkedText text={text} />
        <p className="mt-5 text-sm text-ink-soft">
          {version ? `Version ${version.version} · last updated ${longDate(version.created_at)}` : "Last reviewed November 2026"}
        </p>
      </Prose>
    </div>
  );
}
