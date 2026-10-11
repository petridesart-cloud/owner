import type { Metadata } from "next";
import Link from "next/link";
import { PolicyCard } from "@/components/PolicyCard";
import { STUDIO_RULES } from "@/lib/policy";

export const metadata: Metadata = { title: "Studio Rules" };

export default function StudioRulesPage() {
  return (
    <div>
      <PolicyCard title="Studio Rules" items={STUDIO_RULES}
        footnote={<>See also the <Link href="/policy/payments" className="font-medium text-ink underline underline-offset-4">Payments, Cancellation &amp; Membership Policy</Link>.</>} />
    </div>
  );
}
