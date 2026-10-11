import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DraftNotice, Prose } from "@/components/Prose";
import { PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";

type Settings = Awaited<ReturnType<typeof getSettings>>;

const PAGES: Record<string, { title: string; body: (s: Settings) => React.ReactNode }> = {
  terms: {
    title: "Terms & Conditions",
    body: (s) => (
      <>
        <h2>Who we are</h2>
        <p>{s.legal_name} is run by {s.trader_name}, an individual trader, at {s.address}. Contact: {s.contact_email}, {s.contact_phone}.</p>
        <h2>Bookings</h2>
        <p>A booking is confirmed only after successful payment or after a class credit is deducted. Each booking is for one person, for the class, date and time shown.</p>
        <h2>Prices &amp; payment</h2>
        <p>Prices are in euro and are the final price you pay{s.vat_registered ? `, including VAT at ${Number(s.vat_rate)}%` : ""}. {s.online_payments_enabled ? "Online payments are processed by Stripe; we never see or store your card details." : "Payment is made at the studio by cash or card. You receive a payment confirmation (receipt)."}</p>
        <h2>Packages, packs and classes (credits)</h2>
        <ul>
          <li>Each package gives a number of classes (credits) for a class type (reformer or mat). Some classes, such as private sessions, may use more than one credit; this is shown before you book.</li>
          <li>Classes from a monthly package expire at the end of each period{s.rollover_max ? `, except up to ${s.rollover_max} unused classes, which roll over once` : ""}. Packages are valid for 30 or 60 days from the date of your first class, depending on the package; classes can&apos;t be booked beyond the expiry date.</li>
          <li>Classes have no cash value, are personal and can&apos;t be transferred, and aren&apos;t refundable once expired, unless required by law.</li>
          <li>{s.online_payments_enabled ? "Monthly packages renew automatically until cancelled. You can cancel renewal any time from your Membership page; it takes effect at the end of the current period. If a renewal payment fails, no new classes are added until it's paid." : "Monthly packages don't renew automatically; you renew at the studio. We'll remind you before the period ends."}</li>
          <li>Changing package applies from the next period.</li>
          <li>Packages active during studio closures (Christmas, Easter, Summer) are frozen for the closed days.</li>
        </ul>
        <h2>Late arrival &amp; no-shows</h2>
        <p>For safety we may refuse entry more than 10 minutes after the start. Late arrivals and no-shows are treated as attended classes.</p>
        <h2>Changes by the studio</h2>
        <p>We may need to cancel or reschedule a class (for example, illness or too few participants). If we cancel, you receive your credit back or a refund; see the Cancellation &amp; Refund Policy.</p>
        <h2>Health &amp; liability</h2>
        <p>You take part at your own risk and must follow the instructor&apos;s guidance and the Health &amp; Safety terms. Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence.</p>
        <h2>Law</h2>
        <p>These terms are governed by the laws of the Republic of Cyprus. You can also use the EU Online Dispute Resolution platform.</p>
      </>
    ),
  },
  cancellation: {
    title: "Cancellation & Refunds",
    body: (s) => (
      <>
        <h2>Cancelling a class</h2>
        <p>You can cancel free of charge until {s.cancellation_cutoff_hours} hours before the class starts. The class (credit) goes back to your account with its original expiry date. If you paid for a single class, you receive a class credit of the same type. Unpaid pay-at-the-studio bookings are simply released.</p>
        <h2>Inside {s.cancellation_cutoff_hours} hours</h2>
        <p>Cancellations within {s.cancellation_cutoff_hours} hours of class are not refunded: the class is used. Please still cancel: your spot is offered to the waitlist.{s.refund_late_cancel_if_filled ? " If someone takes your spot, we return your credit." : ""}</p>
        <h2>Waitlist</h2>
        <p>When a spot opens, the first person on the waitlist is notified and has {Math.round(s.waitlist_window_minutes / 60)} hours (or until the cancellation cutoff) to claim it. After that, it goes to the next person.</p>
        <h2>If we cancel</h2>
        <p>If the studio cancels a class, you are notified and your credit is returned automatically. Special events paid by card are refunded to your card.</p>
        <h2>Right of withdrawal</h2>
        <p>[To confirm with a lawyer:] Under EU consumer law (Directive 2011/83/EU, art. 16(l)), the 14-day right of withdrawal does not apply to leisure services booked for a specific date or period. Class packs not tied to a date may be treated differently.</p>
      </>
    ),
  },
  privacy: {
    title: "Privacy Policy",
    body: (s) => (
      <>
        <h2>Controller</h2>
        <p>{s.trader_name}, trading as {s.legal_name}, {s.address}. For any data request, email {s.contact_email}.</p>
        <h2>What we collect and why</h2>
        <table>
          <thead><tr><th>Data</th><th>Purpose</th><th>Legal basis</th></tr></thead>
          <tbody>
            <tr><td>Name, email, phone</td><td>Account, bookings, reminders, contacting you about a class</td><td>Contract (art. 6(1)(b))</td></tr>
            <tr><td>Bookings, classes (credits), payments</td><td>Providing classes, payment records</td><td>Contract; legal obligation (art. 6(1)(c))</td></tr>
            <tr><td>Health note (optional)</td><td>Adapting exercises safely</td><td>Explicit consent (art. 9(2)(a)), withdrawable any time</td></tr>
            <tr><td>Consent records</td><td>Proving consent</td><td>Legal obligation</td></tr>
            <tr><td>Marketing preferences</td><td>News about schedules and events</td><td>Consent (art. 6(1)(a)), opt-in only</td></tr>
            <tr><td>Security logs (hashed)</td><td>Preventing abuse of sign-in codes</td><td>Legitimate interest (art. 6(1)(f))</td></tr>
          </tbody>
        </table>
        <h2>Who processes it for us</h2>
        <ul>
          <li>Supabase (database &amp; sign-in, EU region, Frankfurt)</li>
          <li>Vercel (hosting)</li>
          <li>Stripe (online payments, only once enabled; card data is handled only by Stripe)</li>
          <li>Resend (email delivery)</li>
          <li>Twilio (SMS, only if enabled)</li>
        </ul>
        <p>Each is bound by a data processing agreement. Transfers outside the EEA rely on Standard Contractual Clauses or the EU-US Data Privacy Framework.</p>
        <h2>How long we keep it</h2>
        <ul>
          <li>Account data: while your account is active, then deleted or anonymised after 24 months of inactivity.</li>
          <li>Health note: until you delete it or withdraw consent, and at most while your account is active.</li>
          <li>Payment records: 6 years (bookkeeping obligations; to be confirmed with an accountant).</li>
          <li>Message logs: 12 months.</li>
        </ul>
        <h2>Your rights</h2>
        <p>You can access, correct, export or delete your data, object to or restrict processing, and withdraw consent at any time. Most of this is self-service in your Account page (Download my data / Delete my account). You can also complain to the Commissioner for Personal Data Protection in Cyprus (dataprotection.gov.cy).</p>
        <h2>Cookies</h2>
        <p>We only use essential cookies. See the Cookies policy.</p>
      </>
    ),
  },
  cookies: {
    title: "Cookies",
    body: () => (
      <>
        <p>We use only cookies that are strictly necessary for the site to work. No analytics or advertising cookies are set, so no consent banner is needed.</p>
        <table>
          <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr></thead>
          <tbody>
            <tr><td>sb-*-auth-token</td><td>Keeps you signed in (Supabase Auth). Essential.</td><td>Session / up to 1 week</td></tr>
          </tbody>
        </table>
        <h2>Optional third-party content</h2>
        <p>The map on the Our Studio page only loads if you tap &quot;Load map&quot;. Google may then set its own cookies. Stripe sets its own cookies on its checkout page.</p>
      </>
    ),
  },
  health: {
    title: "Health & Safety",
    body: () => (
      <>
        <p>Pilates is physical exercise. Before your first class you confirm that:</p>
        <ul>
          <li>you are in good health and fit to take part in exercise;</li>
          <li>you will tell your instructor before class about any injury, medical condition, recent surgery or pregnancy;</li>
          <li>you will follow the instructor&apos;s guidance and stop if you feel pain, dizziness or discomfort;</li>
          <li>if in doubt, you have checked with your doctor or physiotherapist.</li>
        </ul>
        <p>Our classes are not medical treatment and do not replace advice from a healthcare professional.</p>
      </>
    ),
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: PAGES[slug]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "cancellation") redirect("/policy/payments"); // her own policy page replaces it
  const page = PAGES[slug];
  if (!page) notFound();
  const s = await getSettings();
  return (
    <div>
      <PageTitle eyebrow="Legal" title={page.title} />
      <DraftNotice />
      <Prose>{page.body(s)}</Prose>
    </div>
  );
}
