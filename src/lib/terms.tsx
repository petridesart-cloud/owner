import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { identity } from "@/lib/identity";
import type { LegalSettings } from "@/lib/legal";

/**
 * The Terms & Conditions as plain text she can edit (Settings → Your texts). Lines starting with "## " are
 * headings, "- " are bullet points, anything else is a paragraph. The default follows her settings, and the
 * trader details she hasn't filled in yet stay visible [placeholders] (A-012).
 */
export function defaultTerms(s: LegalSettings) {
  const id = identity(s);
  const cut = s.cancellation_cutoff_hours;
  const weeks = Math.round(s.booking_window_days / 7);
  return [
    "## Who we are",
    `${id.name} is run by ${id.owner}, an individual trader (not a registered company${s.vat_registered ? "" : " and not registered for VAT"}), based in ${id.address}. Contact: ${id.email}, ${id.phone}, Instagram ${id.instagram}.`,
    "## Who can book",
    "Our classes are for adults aged 18 or over. Each account is for one person: please keep your password to yourself.",
    "## How a booking or package is agreed",
    `- Packages: you send a request in the app and we show you how to pay, with your reference (RF-…). The package starts once we mark your payment as received. A request that isn't paid within ${s.unpaid_request_expiry_hours} hours expires.`,
    "- Single classes, trials, drop-ins and events: booking reserves your spot for the class, date and time shown, and you pay before class.",
    `- You can book up to ${plural(weeks, "week")} ahead. Each booking is for one person.`,
    "## Prices and payment",
    `- Prices are in euro and are the total price you pay.${s.vat_registered ? ` They include VAT at ${Number(s.vat_rate)}%.` : " No VAT is charged because we aren't registered for VAT."}`,
    s.online_payments_enabled
      ? "- Online payments are processed by Stripe; we never see or store your card details. You can also pay in advance by cash, Revolut or bank transfer."
      : "- Pay in advance by cash, Revolut or bank transfer (the details are shown when you request a package or book).",
    "- You receive a payment confirmation (receipt). It isn't a tax invoice.",
    `- Students get ${s.student_discount_pct}% off group packages once we've checked their student card in person. Discount codes and rewards don't add up with the student price: the lower price applies.`,
    "## Packages",
    "- Each package gives a number of classes for a class type (for example, Reformer). Events are paid individually and don't use package classes.",
    "- A package is valid for 30 or 60 days from the date of your first class, depending on the package. Classes can't be booked beyond the expiry date, and classes not used by then expire.",
    "- Packages are personal and can't be transferred or shared.",
    s.online_payments_enabled
      ? "- Monthly packages renew automatically until cancelled; cancel renewal any time on your Membership page, and it takes effect at the end of the current period. Other packages don't renew."
      : "- Packages don't renew automatically. When yours is used up or about to end, choose a new one in the app under Packages.",
    "- Packages are frozen while the studio is closed (for example at Christmas, Easter and in the summer) and during a freeze we agree with you: the end date moves by the same number of days.",
    "## Your right to withdraw from a package (14 days)",
    "- You can withdraw from a package within 14 days of the day we mark it paid, without giving a reason.",
    "- If you haven't used any class from it, you get a full refund.",
    "- If you book and take classes within those 14 days, you're asking us to start straight away. If you then withdraw, we refund the price minus the classes already used (attended, missed or cancelled late), each at the package price divided by its number of classes.",
    `- To withdraw, tell us clearly by email to ${id.email} or at the studio. You can use this model text, but you don't have to: "To ${id.owner}, ${id.name}, ${id.address}, ${id.email}: I withdraw from my contract for the following package: [package], paid on [date]. Name: [your name]. Email: [your email]. Date: [today's date]."`,
    "- We refund you within 14 days of hearing from you, by the same method you paid, at no cost to you. Upcoming classes booked from that package are cancelled.",
    "- Single classes, trials, drop-ins and events are booked for a specific date and time, so the 14-day right of withdrawal doesn't apply to them (EU Directive 2011/83/EU, art. 16(l)). The cancellation rules below apply instead.",
    "## Cancelling a class",
    `- ${cut} hours or more before class: cancel in the app and the class goes back into the same package, with its original expiry date.`,
    `- Less than ${cut} hours before class, or not coming: the class is used.${s.refund_late_cancel_if_filled ? " If someone else takes your spot, we return your class." : ""} Please still cancel, so your spot goes to the waitlist.`,
    `- The waitlist: if a spot opens more than ${s.waitlist_close_minutes >= 60 ? plural(Math.round(s.waitlist_close_minutes / 60), "hour") : plural(s.waitlist_close_minutes, "minute")} before class, the first person waiting who has a package class is booked in automatically and emailed, and these cancellation rules apply to that booking.`,
    "- Events can't be cancelled in the app. If you can't come, message the studio.",
    "## Changes and cancellations by the studio",
    "We may need to cancel or move a class (for example because of illness). If we cancel a class, the class always comes back into your package so you can book another time, even if you had already cancelled it late. If that leaves you too little time to use it before your package ends, we may extend your package. If we cancel an event, you get a full refund. Apart from these cases and your right to withdraw, unused or expired classes aren't refunded.",
    "## Health & safety",
    "Before your first booking you accept the [Health & Safety acknowledgement](/legal/health). A doctor's note is needed in the cases it lists.",
    "## Arriving late",
    "For safety we may not let you join more than 10 minutes after the start. A class you arrive too late for, or miss, counts as used. Please keep phones on silent, and follow the instructor's guidance: we may refuse participation for safety reasons.",
    "## Photos",
    "We take and share photos only according to the choice in your Account (with face, without face, or none).",
    "## Liability",
    "Nothing in these terms excludes or limits liability for death or personal injury caused by our negligence, or any other liability the law doesn't allow us to limit. Otherwise our liability is limited to the price you paid for the package or class concerned. We aren't responsible for personal belongings left at the studio, unless lost through our negligence.",
    "## Changes to these terms",
    "New versions apply to bookings and requests made after you've accepted them in the app. Packages already paid keep the terms they were bought under.",
    "## Complaints and law",
    `Please contact us first at ${id.email}. These terms are governed by the laws of the Republic of Cyprus and the Cyprus courts, without affecting your rights as a consumer where you live. You can also contact the Consumer Protection Service of Cyprus (www.consumer.gov.cy), which lists the out-of-court dispute resolution bodies.`,
  ].join("\n");
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Inline text with [label](/path) links to pages of this site only; everything else stays plain text. */
function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\((\/[\w\-/?=&#]*)\)/g)) {
    out.push(text.slice(last, m.index), <Link key={m.index} href={m[2]}>{m[1]}</Link>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

type Block = { t: "h" | "p"; v: string } | { t: "ul"; v: string[] } | { t: "table"; v: string[][] };

/**
 * Renders her text: "## " headings, "- " bullets (grouped into lists), "| a | b |" table rows (the first row is the
 * header, "| --- |" rows are skipped), paragraphs, and [label](/path) links to this site. Plain text only (React escapes it).
 */
export function MarkedText({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const last = blocks.at(-1);
    if (line.startsWith("## ")) blocks.push({ t: "h", v: line.slice(3) });
    else if (/^[-•] /.test(line)) {
      if (last?.t === "ul") last.v.push(line.slice(2)); else blocks.push({ t: "ul", v: [line.slice(2)] });
    } else if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      if (last?.t === "table") last.v.push(cells); else blocks.push({ t: "table", v: [cells] });
    } else blocks.push({ t: "p", v: line });
  }
  return (
    <>
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.t === "ul" ? <ul>{b.v.map((li, j) => <li key={j}><Inline text={li} /></li>)}</ul>
            : b.t === "table" ? (
              <div role="region" aria-label="Table (scrolls sideways)" tabIndex={0} className="-mx-1 overflow-x-auto px-1">
                <table>
                  <thead><tr>{b.v[0].map((c, j) => <th key={j} scope="col"><Inline text={c} /></th>)}</tr></thead>
                  <tbody>{b.v.slice(1).map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            )
            : b.t === "h" ? <h2>{b.v}</h2> : <p><Inline text={b.v} /></p>}
        </Fragment>
      ))}
    </>
  );
}
