"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The branded "something went wrong" screen (A-020), shared by the error boundaries. It never shows the
 * raw error; a booking may have gone through, so it points to My classes before trying again.
 */
export function ErrorScreen({ error, retry, home = "/", homeLabel = "My classes", homeHref = "/bookings" }: {
  error: unknown; retry?: () => void; home?: string; homeLabel?: string; homeHref?: string;
}) {
  useEffect(() => { console.error(error); }, [error]);
  const btn = "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] transition";
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-5 py-10 text-center" role="alert">
      <p className="eyebrow">Re·Form</p>
      <h1 className="display mt-3 text-[1.6rem] text-ink">Something went wrong</h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
        We lost the connection or couldn&apos;t load this page. If you were booking or cancelling, check {homeLabel} before trying again.
      </p>
      <div className="mt-6 flex flex-col gap-2.5">
        {retry && <button type="button" onClick={() => retry()} className={`${btn} bg-ink text-paper hover:bg-plum-700`}>Try again</button>}
        <Link href={homeHref} className={`${btn} border border-ink/15 bg-white/60 text-ink hover:bg-white`}>{homeLabel}</Link>
        <Link href={home} className="min-h-11 pt-3 text-sm text-ink-soft underline underline-offset-4">Home</Link>
      </div>
    </main>
  );
}
