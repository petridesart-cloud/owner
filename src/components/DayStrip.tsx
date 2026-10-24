"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { keyToDate, longDate, weekdayShort } from "@/lib/time";

/** Horizontal, swipeable row of days (client Schedule and studio Classes). The chosen day scrolls into view. */
export function DayStrip({ keys, counts, selected, today, href, className = "" }: {
  keys: string[]; counts: Record<string, number>; selected: string; today: string; href: string; className?: string;
}) {
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ block: "nearest", inline: "center" }); }, [selected]);
  return (
    <nav aria-label="Choose a day" className={`glass sticky z-20 border-y border-line/60 py-2.5 ${className}`}>
      <ul className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-5">
        {keys.map((k) => {
          const dt = keyToDate(k);
          const count = counts[k] ?? 0;
          const on = k === selected;
          return (
            <li key={k} className="snap-start">
              <Link
                ref={on ? active : undefined}
                href={`${href}${href.includes("?") ? "&" : "?"}day=${k}`}
                scroll={false}
                aria-current={on ? "date" : undefined}
                aria-label={`${longDate(dt)}${count ? `, ${count} classes` : ", no classes"}`}
                className={`flex h-[68px] w-[52px] flex-col items-center justify-center rounded-2xl border transition ${
                  on ? "border-ink bg-ink text-paper shadow-[var(--shadow-lift)]" : count ? "border-line bg-white/80 text-ink hover:border-lilac-300" : "border-transparent text-ink-soft"
                }`}
              >
                <span className="text-[0.66rem] font-medium uppercase tracking-[0.12em]">{k === today ? "Today" : weekdayShort(dt)}</span>
                <span className="mt-0.5 font-serif text-[1.45rem] leading-none">{Number(k.slice(8))}</span>
                <span aria-hidden className={`mt-1 size-1 rounded-full ${count ? (on ? "bg-lilac-200" : "bg-lilac-300") : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
