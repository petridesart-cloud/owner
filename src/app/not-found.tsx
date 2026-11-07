import Link from "next/link";
import { connection } from "next/server";

export const metadata = { title: "Page not found" };

// Rendered per request so its scripts carry the CSP nonce (A-043).
export default async function NotFound() {
  await connection();
  const btn = "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] transition";
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-5 py-10 text-center">
      <p className="eyebrow">Re·Form</p>
      <h1 className="display mt-3 text-[1.6rem] text-ink">Page not found</h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">This link doesn&apos;t lead anywhere, or the page has moved.</p>
      <div className="mt-6 flex flex-col gap-2.5">
        <Link href="/schedule" className={`${btn} bg-ink text-paper hover:bg-plum-700`}>See the schedule</Link>
        <Link href="/bookings" className={`${btn} border border-ink/15 bg-white/60 text-ink hover:bg-white`}>My classes</Link>
      </div>
    </main>
  );
}
