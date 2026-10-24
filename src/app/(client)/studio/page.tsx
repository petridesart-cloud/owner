import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { ClickToLoadMap } from "@/components/ClickToLoadMap";
import { PhotoStrip } from "@/components/PhotoStrip";
import { Prose } from "@/components/Prose";
import { ButtonLink, PageTitle, Section } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";
import { getMedia } from "@/lib/media";
import { business } from "@/lib/business";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const [s, t, photos, portrait] = await Promise.all([getSettings(), getTexts(), getMedia("studio:"), getMedia("instructor")]);
  const sections = s.studio_sections.length ? s.studio_sections : ["Reformers", "Mat"];
  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Studio" script="The">{t.studio_text}</PageTitle>

      <div className="space-y-7">
        {sections.map((name) => (
          <section key={name} aria-label={name}>
            <h2 className="display mb-3 px-5 text-[1.05rem] text-ink">{name}</h2>
            <PhotoStrip photos={photos.filter((p) => p.slot === `studio:${name}`)} label={name} />
          </section>
        ))}
      </div>

      <Section title="What to bring" className="mt-8">
        <ul className="card space-y-2 px-5 py-5 text-[0.95rem] leading-relaxed text-ink">
          {t.what_to_bring.map((w) => <li key={w}>{w}</li>)}
        </ul>
      </Section>

      <section aria-labelledby="magic" className="mt-10">
        <header className="px-5">
          <p className="eyebrow">About your instructor</p>
          <h2 id="magic" className="display mt-2 text-[1.6rem] text-ink"><span className="mr-2 font-script text-[2rem] normal-case tracking-normal text-plum-700">The</span>Magic</h2>
        </header>
        <div className="mt-4"><PhotoStrip photos={portrait} label="Your instructor" tall /></div>
        <div className="mt-2"><Prose>{t.magic_text.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}</Prose></div>
      </section>

      <Section title="Find us" className="mt-8">
        <ClickToLoadMap query={business(s).address ?? "Limassol, Cyprus"} address={business(s).address ?? "Limassol, Cyprus"} />
      </Section>
      <div className="mt-6 px-5"><ButtonLink href="/packs" className="w-full">Secure your package</ButtonLink></div>
    </div>
  );
}
