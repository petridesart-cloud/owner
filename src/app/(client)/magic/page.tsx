import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { getTexts } from "@/lib/content";
import { ButtonLink, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "The Magic" };

export default async function MagicPage() {
  const t = await getTexts();
  return (
    <div>
      <PageTitle eyebrow="About your instructor" title="Magic" script="The" />
      <div className="mx-5 mb-4 aspect-[4/5] rounded-[var(--radius-card)] bg-gradient-to-br from-lilac-200 via-lilac-100 to-mauve-soft shadow-[var(--shadow-soft)]" role="img" aria-label="Portrait of the instructor (photo coming soon)" />
      <Prose>
        {t.magic_text.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
      </Prose>
      <div className="mt-6 px-5"><ButtonLink href="/schedule" className="w-full">Book a class with her</ButtonLink></div>
    </div>
  );
}
