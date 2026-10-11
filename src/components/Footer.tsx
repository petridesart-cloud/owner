import Link from "next/link";
import { getSettings } from "@/lib/auth";

const legal = [
  { href: "/policy/payments", label: "Payments & Cancellation" },
  { href: "/legal/terms", label: "Terms & Conditions" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/health", label: "Health & Safety" },
  { href: "/policy", label: "Studio Rules" },
];

export async function Footer() {
  const s = await getSettings();
  return (
    <footer className="mx-5 mb-28 mt-14 border-t border-line pt-6 text-xs leading-relaxed text-ink-soft">
      <nav aria-label="Legal">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {legal.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-block py-1.5 underline-offset-4 hover:underline">{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <address className="mt-4 not-italic">
        <strong className="font-medium text-ink">{s.legal_name}</strong>
        <br />Run by {s.trader_name}
        <br />{s.address}
        {s.vat_registered && s.vat_number && <><br />VAT {s.vat_number}</>}
        <br /><a className="underline underline-offset-4" href={`mailto:${s.contact_email}`}>{s.contact_email}</a> · <a className="underline underline-offset-4" href={`tel:${s.contact_phone.replace(/\s/g, "")}`}>{s.contact_phone}</a>
      </address>
      <p className="mt-4">© {new Date().getFullYear()} Re·Form Pilates Studio. This site uses essential cookies only.</p>
    </footer>
  );
}
