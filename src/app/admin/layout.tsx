import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./AdminNav";
import { Wordmark } from "@/components/Logo";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · Studio · Re·Form" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-30 border-b border-line/70">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-2"><Wordmark className="text-[1.35rem]" /><span className="eyebrow">Studio</span></Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-ink-soft hover:text-ink">View app ↗</Link>
        </div>
        <AdminNav />
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-24 pt-5">
        {children}
        <p className="mt-12 text-center text-xs text-ink-soft">Signed in as {viewer.email}</p>
      </main>
    </div>
  );
}
