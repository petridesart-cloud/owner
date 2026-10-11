import type { Metadata } from "next";
import { AtSign, Mail, Phone } from "lucide-react";
import { Card, PageTitle } from "@/components/ui";
import { getSettings } from "@/lib/auth";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const s = await getSettings();
  const items = [
    { icon: AtSign, label: "Instagram", value: `@${s.instagram_handle}`, href: `https://instagram.com/${s.instagram_handle}` },
    { icon: Mail, label: "Email", value: s.contact_email, href: `mailto:${s.contact_email}` },
    { icon: Phone, label: "Phone", value: s.contact_phone, href: `tel:${s.contact_phone.replace(/\s/g, "")}` },
  ];
  return (
    <div>
      <PageTitle eyebrow="Say hello" title="Contact">Questions about classes or your booking? We&apos;d love to hear from you.</PageTitle>
      <ul className="space-y-2.5 px-5">
        {items.map(({ icon: Icon, label, value, href }) => (
          <li key={label}>
            <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
              <Card className="flex min-h-16 items-center gap-4 px-4 py-3 transition hover:shadow-[var(--shadow-lift)]">
                <span className="grid size-11 place-items-center rounded-full bg-lilac-100 text-ink"><Icon aria-hidden size={19} /></span>
                <span><span className="block text-xs text-ink-soft">{label}</span><span className="font-medium text-ink">{value}</span></span>
              </Card>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
