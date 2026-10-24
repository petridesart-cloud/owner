"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox } from "@/components/ui";
import { buyPackAction, type PayMethod } from "./actions";

export type Option = { id: string; perWeek: number; credits: number; cents: number; listCents: number; student: boolean; validityDays: number };
export type Group = { months: number; options: Option[] };

const eur = (c: number) => `€${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const METHOD_LABEL: Record<PayMethod, string> = { cash: "Cash", revolut: "Revolut", bank_transfer: "Bank transfer" };

/** Pick a package (per week × months), choose cash or Revolut, accept the terms, request it. */
export function PackagePicker({ kind, groups, methods, online }: { kind: string; groups: Group[]; methods: PayMethod[]; online: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Option | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <fieldset key={g.months} className="card px-4 py-4">
          <legend className="sr-only">{kind}, {g.months} month{g.months === 1 ? "" : "s"}</legend>
          <div className="px-1">
            <p className="display text-[1.05rem] text-ink">{g.months} month{g.months === 1 ? "" : "s"}</p>
            <p className="text-xs text-ink-soft">Valid {g.options[0]?.validityDays} days from your first class</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {g.options.map((o) => {
              const on = selected?.id === o.id;
              return (
                <label key={o.id} className="cursor-pointer">
                  <input type="radio" name="package" value={o.id} checked={on} onChange={() => { setSelected(o); setError(null); }} className="peer sr-only" />
                  <span className="flex min-h-[84px] flex-col justify-between rounded-2xl border border-line bg-white px-3.5 py-3 text-ink transition peer-checked:border-plum-700 peer-checked:bg-lilac-100 peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300">
                    <span className="text-sm font-medium">{o.perWeek} per week</span>
                    <span className="flex items-end justify-between gap-1">
                      <span className="whitespace-nowrap text-xs text-ink-soft">{o.credits} classes</span>
                      <span className="text-right">
                        {o.student && <span className="block text-[0.7rem] text-ink-soft line-through">{eur(o.listCents)}</span>}
                        <span className="font-serif text-[1.45rem] leading-none">{eur(o.cents)}</span>
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {selected && (
        <div className="card animate-rise space-y-4 px-5 py-5" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium text-ink">{kind} · {selected.perWeek} per week · {selected.validityDays / 30} month{selected.validityDays > 30 ? "s" : ""}</p>
            <p className="font-serif text-2xl text-ink">{eur(selected.cents)}</p>
          </div>
          {selected.student && <p className="-mt-2 text-xs font-medium text-plum-700">Student price</p>}
          {!online && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">How will you pay?</legend>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => (
                  <label key={m} className="cursor-pointer">
                    <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="peer sr-only" />
                    <span className="flex min-h-12 items-center justify-center rounded-full border border-line bg-white px-4 text-sm font-medium text-ink transition peer-checked:border-plum-700 peer-checked:bg-lilac-100 peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300">{METHOD_LABEL[m]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <ul className="list-disc space-y-1 rounded-2xl bg-lilac-50 py-3 pl-8 pr-4 text-sm leading-relaxed text-ink">
            <li>{selected.credits} {kind.toLowerCase()} classes, valid {selected.validityDays} days from the date of your first class. &ldquo;{selected.perWeek} per week&rdquo; is a guide: use them as you like within that time.</li>
            <li>Classes can&apos;t be booked after the expiry date; unused classes expire and are non-refundable.</li>
            <li>{online ? "Paid now by secure checkout." : "Paid in advance. Your classes appear as soon as your instructor confirms the payment."}</li>
            <li>Personal: packages can&apos;t be shared or transferred.</li>
          </ul>
          <Checkbox id="accept" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}>
            I accept these package terms and the <a href="/legal/terms" target="_blank" className="font-medium underline underline-offset-4">Terms</a>.
          </Checkbox>
          <Button className="w-full" disabled={pending || !accepted} onClick={() => start(async () => {
            const res = await buyPackAction(selected.id, accepted, method);
            if (!res.ok) return setError(res.error);
            const url = res.data!.redirect;
            if (url.startsWith("http")) window.location.assign(url); else router.push(url);
          })}>{pending ? "One moment…" : online ? "Buy package" : "Request package"}</Button>
          {error && <p role="alert" className="text-sm text-burgundy">{error}</p>}
        </div>
      )}
    </div>
  );
}
