import { env } from "@/lib/env";

export type TemplateName =
  | "login_code"
  | "booking_confirmed"
  | "reminder_24h"
  | "reminder_2h"
  | "cancellation_confirmed"
  | "waitlist_offer"
  | "class_cancelled"
  | "credits_added"
  | "payment_request"
  | "renewal_upcoming"
  | "payment_failed"
  | "credits_expiring"
  | "credits_low"
  | "weekly_booked"
  | "weekly_full";

export type TemplateData = {
  name?: string;
  code?: string;
  className?: string;
  when?: string;      // "Monday 13 October, 08:00"
  location?: string | null;
  note?: string;      // extra sentence (refund info, offer expiry, ...)
  link?: string;
};

type Rendered = { subject: string; heading: string; lines: string[]; cta?: { label: string; href: string }; sms: string };

const first = (n?: string) => (n ? n.split(" ")[0] : "there");

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function render(t: TemplateName, raw: TemplateData): Rendered {
  // Escape every value: names and notes are user-supplied and end up in HTML email.
  const d = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? escapeHtml(v) : v])) as TemplateData;
  const link = raw.link ?? env.siteUrl;
  switch (t) {
    case "login_code":
      return {
        subject: `${d.code} is your Re·Form code`,
        heading: "Your sign-in code",
        lines: [`Enter this code to continue: <strong style="font-size:28px;letter-spacing:6px">${d.code}</strong>`, "It expires in 10 minutes. If you didn't ask for it, you can ignore this email."],
        sms: `${d.code} is your Re·Form code. It expires in 10 minutes.`,
      };
    case "booking_confirmed":
      return {
        subject: `You're in: ${d.className}, ${d.when}`,
        heading: "Your spot is secured",
        lines: [`Hi ${first(d.name)}, see you at <strong>${d.className}</strong> on ${d.when}.`, d.location ? `Where: ${d.location}` : "", "Arrive 5–10 minutes early, grip socks on.", d.note ?? ""],
        cta: { label: "View my bookings", href: `${link}/bookings` },
        sms: `Re·Form: you're booked for ${d.className}, ${d.when}. See you there!`,
      };
    case "reminder_24h":
      return {
        subject: `Tomorrow: ${d.className}, ${d.when}`,
        heading: "See you tomorrow",
        lines: [`Hi ${first(d.name)}, a little reminder: <strong>${d.className}</strong>, ${d.when}.`, d.note ?? "Remember your grip socks · arrive 5–10 minutes early."],
        cta: { label: "Manage booking", href: `${link}/bookings` },
        sms: `Re·Form reminder: ${d.className} tomorrow, ${d.when}.`,
      };
    case "reminder_2h":
      return {
        subject: `In 2 hours: ${d.className}`,
        heading: "Almost time",
        lines: [`Your class starts at ${d.when}. Water, grip socks, and you.`],
        sms: `Re·Form: ${d.className} starts at ${d.when}. See you soon!`,
      };
    case "cancellation_confirmed":
      return {
        subject: `Cancelled: ${d.className}, ${d.when}`,
        heading: "Booking cancelled",
        lines: [`Your booking for <strong>${d.className}</strong> on ${d.when} is cancelled.`, d.note ?? ""],
        cta: { label: "Book another class", href: `${link}/schedule` },
        sms: `Re·Form: your booking for ${d.className}, ${d.when} is cancelled. ${d.note ?? ""}`.trim(),
      };
    case "waitlist_offer":
      return {
        subject: `A spot opened: ${d.className}, ${d.when}`,
        heading: "A spot just opened for you",
        lines: [`Good news, ${first(d.name)}: a spot in <strong>${d.className}</strong> on ${d.when} is yours if you want it.`, d.note ?? ""],
        cta: { label: "Claim my spot", href: `${link}/bookings` },
        sms: `Re·Form: a spot opened in ${d.className}, ${d.when}. ${d.note ?? ""} Claim it: ${link}/bookings`,
      };
    case "class_cancelled":
      return {
        subject: `Class cancelled: ${d.className}, ${d.when}`,
        heading: "We're so sorry",
        lines: [`I've had to cancel <strong>${d.className}</strong> on ${d.when}.`, d.note ?? "", "Any class I cancel is always replaced: your class is back in your account, so just pick another time that suits you."],
        cta: { label: "Rebook a class", href: `${link}/schedule` },
        sms: `Re·Form: sorry, ${d.className} on ${d.when} is cancelled. Your class is back in your account, so rebook any time.`,
      };
    case "credits_added":
      return {
        subject: "Your class pack is ready",
        heading: "Credits added",
        lines: [`Thank you ${first(d.name)}! ${d.note ?? ""}`],
        cta: { label: "Book a class", href: `${link}/schedule` },
        sms: `Re·Form: ${d.note ?? "credits added"}`,
      };
    case "payment_request":
      return {
        subject: `Your request: ${d.className}`,
        heading: "See you at the studio",
        lines: [`Hi ${first(d.name)}, we've noted your request for <strong>${d.className}</strong>.`, d.note ?? ""],
        cta: { label: "View my classes", href: `${link}/bookings` },
        sms: `Re·Form: request noted for ${d.className}. ${d.note ?? ""}`.trim(),
      };
    case "renewal_upcoming":
      return {
        subject: `Your package renews soon`,
        heading: "Renewal coming up",
        lines: [`Hi ${first(d.name)}, your <strong>${d.className}</strong> renews on ${d.when}.`, d.note ?? ""],
        cta: { label: "Manage membership", href: `${link}/membership` },
        sms: `Re·Form: ${d.className} renews on ${d.when}. ${d.note ?? ""}`.trim(),
      };
    case "payment_failed":
      return {
        subject: "We couldn't renew your package",
        heading: "A small hiccup",
        lines: [`Hi ${first(d.name)}, the payment for <strong>${d.className}</strong> didn't go through. We'll try again automatically.`, "You can update your card any time from your Membership page. New classes are added once it's paid."],
        cta: { label: "Update payment", href: `${link}/membership` },
        sms: `Re·Form: your package payment didn't go through. Update your card: ${link}/membership`,
      };
    case "credits_expiring":
      return {
        subject: "Your classes expire soon",
        heading: "Don't let them slip away",
        lines: [`Hi ${first(d.name)}, ${d.note}`],
        cta: { label: "Book a class", href: `${link}/schedule` },
        sms: `Re·Form: ${d.note} Book: ${link}/schedule`,
      };
    case "credits_low":
      return {
        subject: "1 class left",
        heading: "Almost through your package",
        lines: [`Hi ${first(d.name)}, you have 1 ${d.className ?? ""} class left. Top up whenever you're ready.`],
        cta: { label: "See packages", href: `${link}/packs` },
        sms: `Re·Form: you have 1 class left. Top up: ${link}/packs`,
      };
    case "weekly_booked":
      return {
        subject: "Your weekly classes are booked",
        heading: "See you on the reformer",
        lines: [`Hi ${first(d.name)}, we booked your usual classes: ${d.when}.`, d.note ?? ""],
        cta: { label: "My classes", href: `${link}/bookings` },
        sms: `Re·Form: booked your weekly classes: ${d.when}. ${link}/bookings`,
      };
    case "weekly_full":
      return {
        subject: `${d.className} is full this week`,
        heading: "This one is full",
        lines: [`Hi ${first(d.name)}, your weekly class on ${d.when} is full, so we couldn't book it.`, "Join the waitlist and you'll get the spot if one opens."],
        cta: { label: "Join waitlist", href: d.link ?? `${link}/schedule` },
        sms: `Re·Form: your weekly class ${d.when} is full. Join the waitlist: ${d.link ?? `${link}/schedule`}`,
      };
  }
}

/** On-brand, lilac email shell. Inline styles only (email clients). */
export function emailHtml(r: Rendered) {
  const body = r.lines.filter(Boolean).map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#2E2238">${l}</p>`).join("");
  const cta = r.cta
    ? `<p style="margin:24px 0 8px"><a href="${r.cta.href}" style="display:inline-block;background:#2E2238;color:#FBF8FC;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:13px;letter-spacing:2px;text-transform:uppercase">${r.cta.label}</a></p>`
    : "";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#F3ECF8;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#E9DDF5,#FBF8FC);padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#FBF8FC;border-radius:24px;padding:36px 32px;box-shadow:0 8px 30px rgba(46,34,56,.08)"><tr><td>
<p style="margin:0 0 22px;font-family:Georgia,serif;font-size:30px;font-weight:300;color:#5B4470">Re·Form</p>
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:22px;letter-spacing:3px;text-transform:uppercase;color:#2E2238">${r.heading}</h1>
${body}${cta}
<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#5E5566">Re·Form Pilates Studio · Limassol, Cyprus<br>This is a service message about your booking.</p>
</td></tr></table></td></tr></table></body></html>`;
}
