import type { Metadata } from "next";
import { ClickToLoadMap } from "@/components/ClickToLoadMap";
import { ButtonLink, PageTitle, Section } from "@/components/ui";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";

export const metadata: Metadata = { title: "Our Studio" };

// Photo slots: replace with the studio's own photos (with permission from anyone pictured).
const gallery = [
  { label: "The reformer room", tone: "from-lilac-200 to-mauve-soft" },
  { label: "Morning light", tone: "from-[#efe9e3] to-lilac-100" },
  { label: "Reformer details", tone: "from-mauve to-lilac-100" },
  { label: "SUP Pilates", tone: "from-[#d9ecf3] to-lilac-50" },
];

export default async function StudioPage() {
  const [s, t] = await Promise.all([getSettings(), getTexts()]);
  return (
    <div>
      <PageTitle eyebrow="Limassol, Cyprus" title="Our Studio">
        {t.studio_text}
      </PageTitle>
      <section aria-label="Gallery" className="no-scrollbar -mx-0 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
        {gallery.map((g) => (
          <figure key={g.label} className={`relative h-72 w-56 shrink-0 snap-start overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br ${g.tone} shadow-[var(--shadow-soft)]`}>
            <figcaption className="absolute inset-x-3 bottom-3 rounded-full bg-white/80 px-3 py-1.5 text-center text-xs font-medium text-ink backdrop-blur">{g.label} · photo coming soon</figcaption>
          </figure>
        ))}
      </section>
      <Section title="What to expect" className="mt-8">
        <ul className="card space-y-3 px-5 py-5 text-[0.95rem] leading-relaxed text-ink">
          <li><strong className="font-medium">Small classes.</strong> Three reformers per class, so your instructor can guide you.</li>
          <li><strong className="font-medium">50 minutes.</strong> Arrive 5 minutes early to settle in.</li>
          <li><strong className="font-medium">Bring</strong> grip socks, water and comfortable clothes.</li>
          <li><strong className="font-medium">New to reformer?</strong> Tell us when you book and we&apos;ll show you the ropes (and springs).</li>
        </ul>
      </Section>
      <Section title="Find us" className="mt-8">
        <ClickToLoadMap query={s.address.includes("[") ? "Limassol, Cyprus" : s.address} address={s.address} />
      </Section>
      <div className="mt-6 px-5"><ButtonLink href="/schedule" className="w-full">Secure your spot</ButtonLink></div>
    </div>
  );
}
