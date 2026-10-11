import type { Metadata } from "next";
import Link from "next/link";
import { PolicyCard } from "@/components/PolicyCard";
import { getSettings } from "@/lib/auth";
import { paymentsPolicy } from "@/lib/policy";

export const metadata: Metadata = { title: "Payments, Cancellation & Membership Policy" };

export default async function PaymentsPolicyPage() {
  const s = await getSettings();
  return (
    <div>
      <PolicyCard title="Payments, Cancellation & Membership Policy" items={paymentsPolicy(s)}
        footnote={<>Cancel or reschedule in the app up to {s.cancellation_cutoff_hours} hours before class and your class goes back into your package. Full <Link href="/legal/terms" className="underline underline-offset-4">Terms</Link> · <Link href="/policy" className="underline underline-offset-4">Studio Rules</Link>.</>} />
    </div>
  );
}
