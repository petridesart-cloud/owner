import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { PolicyCard } from "@/components/PolicyCard";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";

export const metadata: Metadata = { title: "Studio Rules & Policies" };

export default async function PoliciesPage() {
  const [s, t] = await Promise.all([getSettings(), getTexts()]);
  return (
    <div className="space-y-4">
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PolicyCard title="Studio Rules" items={t.studio_rules} />
      <div id="payments">
        <PolicyCard title="Payments, Cancellation & Membership Policy" items={t.payments_policy}
          footnote={<>Cancel or reschedule in the app up to {s.cancellation_cutoff_hours} hours before class and your class goes back into your package. Full <Link href="/legal/terms" className="underline underline-offset-4">Terms</Link>.</>} />
      </div>
    </div>
  );
}
