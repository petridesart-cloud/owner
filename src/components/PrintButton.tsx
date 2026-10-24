"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink hover:bg-lilac-100">
      <Printer aria-hidden size={16} /> Save or print
    </button>
  );
}
