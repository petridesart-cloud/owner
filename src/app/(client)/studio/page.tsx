import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { PhotoStrip } from "@/components/PhotoStrip";
import { Prose } from "@/components/Prose";
import { ButtonLink, PageTitle } from "@/components/ui";
import { getTexts } from "@/lib/content";
import { getMedia } from "@/lib/media";

export const metadata: Metadata = { title: "The Studio" };
export const dynamic = "force-dynamic";

// Her notes: the title, her photos, then her own words (optional). Nothing else.
export default async function StudioPage() {
  const [t, photos] = await Promise.all([getTexts(), getMedia("studio:")]);
  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Studio" script="The" />
      <section aria-label="Photos of the studio">
        <PhotoStrip photos={photos} label="The studio" slides />
      </section>
      {t.studio_text && <div className="mt-4"><Prose>{t.studio_text.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}</Prose></div>}
      <div className="mt-8 px-5"><ButtonLink href="/packs" className="w-full">Secure your package</ButtonLink></div>
    </div>
  );
}
