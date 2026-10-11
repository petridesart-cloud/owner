import type { Metadata } from "next";
import { DraftNotice, Prose } from "@/components/Prose";
import { ButtonLink, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "The Magic" };

export default function MagicPage() {
  return (
    <div>
      <PageTitle eyebrow="About your instructor" title="Magic" script="The" />
      <DraftNotice />
      <div className="mx-5 mb-4 aspect-[4/5] rounded-[var(--radius-card)] bg-gradient-to-br from-lilac-200 via-lilac-100 to-mauve-soft shadow-[var(--shadow-soft)]" role="img" aria-label="Portrait of the instructor (photo coming soon)" />
      <Prose>
        <p>[Her story in her own words: how she found Pilates, why she opened Re·Form, and what a class with her feels like.]</p>
        <p>[Her training and qualifications, listed only if real and verifiable.]</p>
        <p>Re·Form is a small studio on purpose: three reformers, one instructor, and time for every body in the room.</p>
      </Prose>
      <div className="mt-6 px-5"><ButtonLink href="/schedule" className="w-full">Book a class with her</ButtonLink></div>
    </div>
  );
}
