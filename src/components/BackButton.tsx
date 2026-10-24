"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** Goes back one step (like the phone's back gesture); falls back to `href` when opened directly. */
export function BackButton({ href = "/", label = "Back", className = "" }: { href?: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const sameSite = document.referrer && new URL(document.referrer).origin === location.origin;
        if (sameSite && history.length > 1) router.back();
        else router.push(href);
      }}
      className={`-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-sm font-medium text-ink hover:bg-lilac-100 ${className}`}
    >
      <ChevronLeft aria-hidden size={20} />
      {label}
    </button>
  );
}
