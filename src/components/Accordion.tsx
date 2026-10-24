import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A collapsible section (native details/summary: works without JavaScript and with screen readers). */
export function Accordion({ title, sub, open = false, id, children }: { title: string; sub?: ReactNode; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details id={id} open={open} className="card group scroll-mt-20 overflow-hidden">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="display block text-[1rem] text-ink">{title}</span>
          {sub && <span className="mt-0.5 block text-xs text-ink-soft">{sub}</span>}
        </span>
        <ChevronDown aria-hidden size={18} className="shrink-0 text-ink-soft transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-5 py-5">{children}</div>
    </details>
  );
}
