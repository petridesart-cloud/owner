"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { inputClass } from "@/components/ui";

/** A drop-down that changes one setting in the address (?month=, ?year=, ?show=) and keeps the scroll position. */
export function Pick({ name, value, label, options }: { name: string; value: string; label: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        name={name} value={value} aria-busy={pending}
        onChange={(e) => {
          const sp = new URLSearchParams(window.location.search);
          sp.set(name, e.target.value);
          start(() => router.replace(`?${sp}`, { scroll: false }));
        }}
        className={`${inputClass} ${pending ? "opacity-60" : ""}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
