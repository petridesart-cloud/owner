import type { Metadata } from "next";
import { business } from "@/lib/business";
import { db } from "@/lib/supabase/admin";
import { BackButton } from "@/components/BackButton";
import { MarkedText, defaultTerms } from "@/lib/terms";
import { notFound, redirect } from "next/navigation";
import { DraftNotice, Prose } from "@/components/Prose";
import { PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";

type Settings = Awaited<ReturnType<typeof getSettings>>;

const PAGES: Record<string, { title: string; body: (s: Settings) => React.ReactNode }> = {
  terms: {
    title: "Terms & Conditions",
    body: () => null, // her editable text (Settings → Your texts), see below
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
        <p>When a spot opens up to {s.waitlist_close_minutes >= 60 ? `${s.waitlist_close_minutes / 60} hour${s.waitlist_close_minutes === 60 ? "" : "s"}` : `${s.waitlist_close_minutes} minutes`} before class, the first person on the waitlist with a class left in their package is booked in automatically and emailed. The usual cancellation rules apply to that booking. You can leave the waitlist any time before a spot opens. Without a package class (or for events), the spot is held for them for {Math.round(s.waitlist_window_minutes / 60)} hours, then goes to the next person. Nobody is moved in after that point.</p>
        <h2>If we cancel</h2>
        <p>If the studio cancels a class, you are notified and your credit is returned automatically. Events paid by card are refunded to your card.</p>
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
        <p>{business(s).owner ?? "The owner"}, trading as {business(s).name}, {business(s).address ?? "Limassol, Cyprus"}. For any data request, {business(s).email ? `email ${business(s).email}` : `message us on Instagram @${s.instagram_handle}`}.</p>
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
        <p>The map on the Studio page only loads if you tap &quot;Load map&quot;. Google may then set its own cookies. Stripe sets its own cookies on its checkout page.</p>
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
  if (slug === "terms") {
    const { data: custom } = await db().from("site_content").select("value").eq("key", "terms").maybeSingle();
    return (
      <div>
        <div className="px-5 pt-3"><BackButton href="/" /></div>
        <PageTitle eyebrow="Legal" title={page.title} />
        {!custom && <DraftNotice />}
        <Prose><MarkedText text={custom?.value || defaultTerms(s)} /></Prose>
      </div>
    );
  }
  return (
    <div>
      <PageTitle eyebrow="Legal" title={page.title} />
      <DraftNotice />
      <Prose>{page.body(s)}</Prose>
    </div>
  );
}
