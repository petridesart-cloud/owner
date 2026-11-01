import { Fragment } from "react";
import { business } from "@/lib/business";
import type { getSettings } from "@/lib/auth";

type Settings = Awaited<ReturnType<typeof getSettings>>;

/**
 * The Terms & Conditions as plain text she can edit (Settings → Your texts). Lines starting with "## " are
 * headings, "- " are bullet points, anything else is a paragraph. The default follows her settings.
 */
export function defaultTerms(s: Settings) {
  const b = business(s);
  const contact = b.email ? `Contact: ${[b.email, b.phone].filter(Boolean).join(", ")}.` : `Contact us on Instagram @${s.instagram_handle}.`;
  return [
    "## Who we are",
    `${b.name} is run by ${b.owner ?? "its owner"}, an individual trader, at ${b.address ?? "Limassol, Cyprus"}. ${contact}`,
    "## Bookings",
    "A booking is confirmed when a class from your package is used, or when you reserve a single class or an event. Each booking is for one person, for the class, date and time shown.",
    "## Prices & payment",
    `Prices are in euro and are the final price you pay${s.vat_registered ? `, including VAT at ${Number(s.vat_rate)}%` : ""}. ${s.online_payments_enabled ? "Online payments are processed by Stripe; we never see or store your card details." : "Packages are paid in advance by cash, Revolut or bank transfer; single classes and events are paid before class. You receive a payment confirmation (receipt)."}`,
    "## Packages and classes",
    "- Each package gives a number of classes (credits) for a class type (for example, Reformer).",
    "- Events are paid individually and don't use classes from a package.",
    "- Packages are valid for 30 or 60 days from the date of your first class, depending on the package. Classes can't be booked beyond the expiry date.",
    "- Classes have no cash value, are personal and can't be transferred, and aren't refundable once expired, unless required by law.",
    `- ${s.online_payments_enabled ? "Monthly packages renew automatically until cancelled. You can cancel renewal any time from your Membership page; it takes effect at the end of the current period." : "Packages don't renew automatically. When yours is used up or about to end, choose a new one in the app under Packages."}`,
    "- Packages active during studio closures (Christmas, Easter, Summer) are frozen for the closed days.",
    "## Late arrival & no-shows",
    "For safety we may refuse entry more than 10 minutes after the start. Late arrivals and no-shows are treated as attended classes.",
    "## Changes by the studio",
    "We may need to cancel or reschedule a class (for example, because of illness). If we cancel, your class goes back into your package so you can book another one. We don't give cash refunds. See the Payments & Cancellation Policy.",
    "## Health & liability",
    "You take part at your own risk and must follow the instructor's guidance and the Health & Safety terms. Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence.",
    "## Law",
    "These terms are governed by the laws of the Republic of Cyprus. You can also use the EU Online Dispute Resolution platform.",
  ].join("\n");
}

/** Renders her text: "## " headings, "- " bullets (grouped into lists), paragraphs. Plain text only (React escapes it). */
export function MarkedText({ text }: { text: string }) {
  const blocks: ({ t: "h" | "p"; v: string } | { t: "ul"; v: string[] })[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push({ t: "h", v: line.slice(3) });
    else if (/^[-•] /.test(line)) {
      const last = blocks.at(-1);
      if (last?.t === "ul") last.v.push(line.slice(2)); else blocks.push({ t: "ul", v: [line.slice(2)] });
    } else blocks.push({ t: "p", v: line });
  }
  return (
    <>
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.t === "ul" ? <ul>{b.v.map((li, j) => <li key={j}>{li}</li>)}</ul> : b.t === "h" ? <h2>{b.v}</h2> : <p>{b.v}</p>}
        </Fragment>
      ))}
    </>
  );
}
