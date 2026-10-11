import type { Metadata } from "next";
import { DraftNotice, Prose } from "@/components/Prose";
import { PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";

export const metadata: Metadata = { title: "Studio Rules" };

export default async function PolicyPage() {
  const s = await getSettings();
  return (
    <div>
      <PageTitle eyebrow={`Version ${s.policy_version}`} title="Studio Rules" />
      <DraftNotice />
      <Prose>
        <h2>Booking</h2>
        <p>Classes are booked and paid for in advance through this app. Your spot is confirmed once payment succeeds or a credit is used.</p>
        <h2>Cancellations</h2>
        <p>Cancel free of charge up to {s.cancellation_cutoff_hours} hours before class and your credit is returned. Later cancellations or no-shows are not refunded, but please still cancel so someone on the waitlist can take your spot.</p>
        <h2>Arrival</h2>
        <p>Arrive 5 minutes early. For safety, we may not be able to admit you more than 10 minutes after class starts.</p>
        <h2>In the studio</h2>
        <ul><li>Grip socks are required on the reformers.</li><li>Please tell your instructor about any injury, condition or pregnancy before class.</li><li>Phones on silent, please.</li></ul>
        <p>[Replace with the studio&apos;s full &quot;Studio Rules / Policy&quot; highlight text.]</p>
      </Prose>
    </div>
  );
}
