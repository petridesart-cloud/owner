import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Terms & policies" };

// Her note (8 Nov): one quiet footer link instead of a row of legal links; everything is still one tap away.
const DOCS = [
  { href: "/policy", label: "Studio Rules" },
  { href: "/policy/payments", label: "Payments & Cancellation" },
  { href: "/legal/terms", label: "Terms & Conditions" },
  { href: "/legal/health", label: "Health & Safety" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/accessibility", label: "Accessibility" },
];

export default function LegalIndex() {
  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/" /></div>
      <PageTitle title="Terms & policies" />
      <div className="px-5">
        <Card className="divide-y divide-line">
          {DOCS.map((d) => (
            <Link key={d.href} href={d.href} prefetch={false} className="flex min-h-12 items-center justify-between px-5 text-[0.95rem] text-ink">
              {d.label}<ChevronRight aria-hidden size={16} className="text-ink-soft" />
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}
