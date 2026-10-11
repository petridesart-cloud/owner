import type { Metadata } from "next";
import Link from "next/link";
import { PolicyCard } from "@/components/PolicyCard";
import { getTexts } from "@/lib/content";

export const metadata: Metadata = { title: "Studio Rules" };

export default async function StudioRulesPage() {
  const t = await getTexts();
  return (
    <div>
      <PolicyCard title="Studio Rules" items={t.studio_rules}
        footnote={<>See also the <Link href="/policy/payments" className="font-medium text-ink underline underline-offset-4">Payments, Cancellation &amp; Membership Policy</Link>.</>} />
    </div>
  );
}
