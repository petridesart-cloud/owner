"use client";
import { useState } from "react";
import { PARQ } from "@/lib/parq";
import { Checkbox } from "./ui";

/** PAR-Q: yes/no for each question; any "yes" shows the doctor advice and needs a confirmation. */
export function ParqFields({ initialYes, answered = false, error }: { initialYes?: string[]; answered?: boolean; error?: string }) {
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>(() =>
    answered ? Object.fromEntries(PARQ.map((q) => [q.key, initialYes?.includes(q.key) ? "yes" : "no"])) : {});
  const anyYes = Object.values(answers).includes("yes");
  return (
    <fieldset className="space-y-3" aria-describedby={error ? "parq-error" : undefined}>
      <legend className="text-sm font-medium text-ink">Health questions (PAR-Q)</legend>
      <p className="text-xs leading-relaxed text-ink-soft">A standard check before starting exercise. Please answer honestly.</p>
      <ol className="space-y-2.5">
        {PARQ.map((q, i) => (
          <li key={q.key} className="rounded-2xl border border-line bg-white px-3.5 py-3">
            <p id={`parq-q-${q.key}`} className="text-sm leading-relaxed text-ink">{i + 1}. {q.text}</p>
            <div role="radiogroup" aria-labelledby={`parq-q-${q.key}`} className="mt-2 grid grid-cols-2 gap-2">
              {(["no", "yes"] as const).map((v) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" name={`parq_${q.key}`} value={v} checked={answers[q.key] === v}
                    onChange={() => setAnswers((a) => ({ ...a, [q.key]: v }))} className="peer sr-only" />
                  <span className="flex min-h-11 items-center justify-center rounded-full border border-line text-sm font-medium text-ink transition peer-checked:border-plum-700 peer-checked:bg-lilac-100 peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300">
                    {v === "yes" ? "Yes" : "No"}
                  </span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {error && <p id="parq-error" className="text-xs font-medium text-burgundy">{error}</p>}
      {anyYes && (
        <div className="space-y-2 rounded-2xl bg-mauve-soft px-4 py-3">
          <p className="text-sm leading-relaxed text-ink">Thank you for telling us. Please check with your doctor before your first class, and let your instructor know so she can adapt the exercises for you.</p>
          <Checkbox id="parq_ack" name="parq_ack">I&apos;ll check with my doctor before starting and tell my instructor. I take part at my own responsibility.</Checkbox>
          <p className="text-xs leading-relaxed text-ink-soft">To let your instructor see these answers, tick the health consent box below. Otherwise only the date you answered is kept.</p>
        </div>
      )}
    </fieldset>
  );
}
