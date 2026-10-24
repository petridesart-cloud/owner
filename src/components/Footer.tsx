import Link from "next/link";
import { getSettings } from "@/lib/auth";
import { business } from "@/lib/business";

const legal = [
  { href: "/policy", label: "Studio Rules" },
  { href: "/policy/payments", label: "Payments & Cancellation" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
];

export async function Footer() {
  const s = await getSettings();
  const b = business(s);
  return (
    <footer className="print:hidden mx-5 mb-28 mt-14 border-t border-line pt-6 text-xs leading-relaxed text-ink-soft">
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
        <strong className="font-medium text-ink">{b.name}</strong>
        {b.owner && <><br />Run by {b.owner}</>}
        <br />{b.address ?? "Limassol, Cyprus"}
        {s.vat_registered && s.vat_number && <><br />VAT {s.vat_number}</>}
        {(b.email || b.phone) && (
          <><br />{b.email && <a className="underline underline-offset-4" href={`mailto:${b.email}`}>{b.email}</a>}{b.email && b.phone && " · "}{b.phone && <a className="underline underline-offset-4" href={`tel:${b.phone.replace(/\s/g, "")}`}>{b.phone}</a>}</>
        )}
      </address>
      <p className="mt-4">© {new Date().getFullYear()} Re·Form Pilates Studio · Essential cookies only · <Link href="/contact" className="underline underline-offset-4">Contact</Link></p>
    </footer>
  );
}
