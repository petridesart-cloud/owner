import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="card mx-5 px-5 py-6 text-[0.95rem] leading-relaxed text-ink [&_h2]:display [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-[1rem] [&_h2:first-child]:mt-0 [&_li]:mb-1.5 [&_p]:mb-3 [&_strong]:font-medium [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-line [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:border-b [&_th]:border-line [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline [&_a]:underline-offset-4">
      {children}
    </div>
  );
}

export function DraftNotice() {
  return (
    <p className="mx-5 mb-3 rounded-2xl border border-mauve/50 bg-mauve-soft px-4 py-2.5 text-xs leading-relaxed text-ink">
      Draft placeholder, written for an individual trader. To be reviewed by a lawyer and accountant before online payments go live.
    </p>
  );
}
