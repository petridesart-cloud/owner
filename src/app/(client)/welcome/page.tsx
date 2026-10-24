import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "Your details" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  const viewer = await requireViewer(`/welcome?next=${encodeURIComponent(next)}`);
  return (
    <div>
      <PageTitle eyebrow="First booking" title="A little about you">
        Just once. Next time we&apos;ll recognise you.
      </PageTitle>
      <div className="px-5">
        <div className="card animate-rise px-5 py-6">
          <WelcomeForm email={viewer.email} first={viewer.profile.first_name ?? viewer.profile.full_name?.split(" ")[0] ?? ""} last={viewer.profile.last_name ?? ""} phone={viewer.profile.phone ?? ""} next={next} />
        </div>
      </div>
    </div>
  );
}
