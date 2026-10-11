"use client";
import { useState } from "react";
import { Share } from "lucide-react";

/** Native share sheet on phones; copies the link elsewhere. */
export function ShareButton({ url, title, text, className = "" }: { url: string; title: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const full = new URL(url, window.location.origin).toString();
        if (navigator.share) {
          try { await navigator.share({ title, text, url: full }); } catch { /* dismissed */ }
        } else {
          await navigator.clipboard.writeText(full);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      <Share aria-hidden size={17} /> {copied ? "Link copied" : "Share"}
    </button>
  );
}
