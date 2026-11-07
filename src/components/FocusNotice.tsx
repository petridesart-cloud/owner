"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** A status message that takes focus when it appears after a redirect, so it's announced and not lost (A-074). */
export function FocusNotice({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div ref={ref} role="status" tabIndex={-1} className="rounded-2xl border border-mauve/40 bg-mauve-soft px-4 py-3 text-sm leading-relaxed focus:outline-none">
      {children}
    </div>
  );
}
