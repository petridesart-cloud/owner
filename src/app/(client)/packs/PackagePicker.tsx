"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ButtonLink, Checkbox, inputClass } from "@/components/ui";
import { withDiscount, type Discount } from "@/lib/discount";
import { buyPackAction, checkCodeAction, type PayMethod } from "./actions";

export type Option = { id: string; perWeek: number; credits: number; cents: number; listCents: number; student: boolean; validityDays: number; kindLabel: string };
/** One card per class type and length; `heading`/`description` open a class type inside a tab with several (e.g. Private → Mat). */
export type Group = { key: string; months: number; title: string; heading?: string; description?: string | null; options: Option[] };

const eur = (c: number) => `€${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const METHOD_LABEL: Record<PayMethod, string> = { cash: "Cash", revolut: "Revolut", bank_transfer: "Bank transfer" };

/** Pick a package (per week × months), choose cash or Revolut, accept the terms, request it. */
export function PackagePicker({ groups, methods, online, cutoff, rewards = [], signedIn = false, seller = null, vatNote = null, tab = "", pick = null }: {
  groups: Group[]; methods: PayMethod[]; online: boolean; cutoff: number; rewards?: Discount[]; signedIn?: boolean;
  /** The Packages tab, and a package to pre-select (coming back from Create account), kept in the return link (A-026). */
  tab?: string; pick?: string | null;
  /** Who sells it (name, address) and "no VAT charged": shown before the request (A-012). */
  seller?: string | null; vatNote?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Option | null>(() => groups.flatMap((g) => g.options).find((o) => o.id === pick) ?? null);
  // Where "Create a free account" and "Sign in" bring them back to: this tab with the same package chosen (A-026).
  const back = selected ? `/packs?type=${tab}&pick=${selected.id}` : `/packs?type=${tab}`;
  const summary = useRef<HTMLHeadingElement>(null);
  const acceptBox = useRef<HTMLInputElement>(null);
  // A-027: choosing a package brings its summary into view and moves focus to it.
  useEffect(() => {
    if (!selected || !summary.current) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    summary.current.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    summary.current.focus({ preventScroll: true });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [discount, setDiscount] = useState<Discount | null>(rewards[0] ?? null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, check] = useTransition();
  const price = (o: Option) => withDiscount(o.listCents, o.cents, discount);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectedLine = selected ? `${selected.credits} ${selected.kindLabel} ${selected.credits === 1 ? "class" : "classes"}, ${eur(price(selected).cents)} selected` : "";
  return (
    <div className="space-y-5">
      {/* Always mounted, so a screen reader announces the choice (A-027). */}
      <p role="status" aria-live="polite" className="sr-only">{selectedLine}</p>
      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
        {g.heading && (
          <div className="px-1 pt-2">
            <h2 className="display text-[1.1rem] text-ink">{g.heading}</h2>
            {g.description && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{g.description}</p>}
          </div>
        )}
        <fieldset className="card px-4 py-4">
          <legend className="sr-only">{g.options[0]?.kindLabel} packages, {g.title}, valid {g.options[0]?.validityDays} days</legend>
          <div className="px-1">
            <p className="display text-[1.05rem] text-ink">{g.title} <span className="text-ink-soft">· valid {g.options[0]?.validityDays} days from your first class</span></p>
          </div>
          <div className="mt-3 space-y-2">
            {g.options.map((o) => {
              const on = selected?.id === o.id;
              return (
                <label key={o.id} className="cursor-pointer">
                  <input type="radio" name="package" value={o.id} checked={on} onChange={() => { setSelected(o); setError(null); }} className="peer sr-only" />
                  <span className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-ink transition peer-checked:border-plum-700 peer-checked:bg-lilac-100 peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-300">
                    <span>
                      <span className="block text-base font-medium">{o.credits} {o.credits === 1 ? "class" : "classes"}</span>
                    </span>
                    <span className="text-right">
                      {(o.student || price(o).cents < o.cents) && <span className="block text-[0.7rem] text-ink-soft line-through">{eur(o.listCents)}</span>}
                      <span className="font-serif text-[1.6rem] leading-none">{eur(price(o).cents)}</span>
                      {price(o).extraClasses > 0 && <span className="block text-[0.7rem] font-medium text-plum-700">+{price(o).extraClasses} free</span>}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        </div>
      ))}

      {selected && (
        <div className="card animate-rise scroll-mt-20 space-y-4 px-5 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 ref={summary} tabIndex={-1} className="font-medium text-ink outline-none">{selected.kindLabel} · {selected.credits} {selected.credits === 1 ? "class" : "classes"} · valid {selected.validityDays} days</h2>
            <p className="font-serif text-2xl text-ink">{eur(price(selected).cents)}</p>
          </div>
          {selected.student && !(discount && price(selected).applies && discount.kind !== "free_classes") && <p className="-mt-2 text-xs font-medium text-plum-700">Student price</p>}

          {discount ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-mauve-soft px-4 py-3">
              <p className="text-sm text-ink">
                <span className="font-medium">{discount.personal ? "Your reward" : `Code ${discount.code}`}: {discount.label}{discount.kind === "free_classes" ? " added to this package" : ""}</span>
                {!price(selected).applies && <span className="block text-xs text-ink-soft">Your student price is already lower, so it won&apos;t be used.</span>}
              </p>
              <button type="button" onClick={() => setDiscount(null)} className="min-h-11 shrink-0 text-sm font-medium text-ink underline underline-offset-4">Remove</button>
            </div>
          ) : rewards.length > 0 ? (
            <button type="button" onClick={() => setDiscount(rewards[0])} className="min-h-11 text-sm font-medium text-ink underline underline-offset-4">Use your reward: {rewards[0].label}</button>
          ) : null}
          {signedIn && !discount && (codeOpen ? (
            <div>
              <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink">Discount code</label>
              <div className="flex gap-2">
                <input id="code" value={code} onChange={(e) => { setCode(e.target.value); setCodeError(null); }} autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  aria-invalid={!!codeError} aria-describedby={codeError ? "code-error" : undefined} className={`${inputClass} uppercase`} />
                <Button type="button" variant="soft" disabled={checking || !code.trim()} className="shrink-0 px-5" onClick={() => check(async () => {
                  const res = await checkCodeAction(code);
                  if (!res.ok) return setCodeError(res.error);
                  setDiscount(res.data!); setCodeOpen(false); setCode("");
                })}>{checking ? "…" : "Apply"}</Button>
              </div>
              {codeError && <p id="code-error" role="alert" className="mt-1.5 text-xs font-medium text-burgundy">{codeError}</p>}
            </div>
          ) : (
            <button type="button" onClick={() => setCodeOpen(true)} className="min-h-11 text-sm text-ink-soft underline underline-offset-4">Have a code?</button>
          ))}
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
            <li>{selected.credits + price(selected).extraClasses} {selected.kindLabel} {selected.credits + price(selected).extraClasses === 1 ? "class" : "classes"} valid {selected.validityDays} days from the date of your first class. Use them whenever you like within that time.</li>
            <li>Cancel at least {cutoff} hours before class and the class goes straight back into your package. Cancellations within {cutoff} hours, and missed classes, use the class and can&apos;t be refunded.</li>
            <li>Classes can&apos;t be booked after the expiry date; unused classes expire and are non-refundable.</li>
            <li>{online ? "Paid now by secure checkout." : "Paid in advance. Your classes appear as soon as your instructor confirms the payment."}</li>
            <li>Personal: packages can&apos;t be shared or transferred.</li>
            <li>You can withdraw within 14 days of payment: a full refund if you haven&apos;t used a class, otherwise minus the classes used (see the Terms).</li>
            <li>Total {eur(price(selected).cents)}{vatNote ? ` (${vatNote})` : ""}.{seller ? ` Sold by ${seller}.` : ""}</li>
          </ul>
          {signedIn ? (
            <>
              <Checkbox id="accept" ref={acceptBox} checked={accepted} onChange={(e) => { setAccepted(e.target.checked); setError(null); }}
                aria-describedby={error ? "pack-error" : undefined}>
                I accept these package terms and the <a href="/legal/terms" target="_blank" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Terms</a>.
              </Checkbox>
              <Button className="w-full" disabled={pending} onClick={() => {
                // A-109: the button stays enabled; if the terms aren't ticked we say so and move focus there.
                if (!accepted) { setError("Please accept the package terms to continue."); acceptBox.current?.focus(); return; }
                start(async () => {
                  const res = await buyPackAction(selected.id, accepted, method, discount && price(selected).applies ? discount.code : null, back);
                  if (!res.ok) return setError(res.error);
                  const url = res.data!.redirect;
                  if (url.startsWith("http")) window.location.assign(url); else router.push(url);
                });
              }}>{pending ? (online ? "Opening checkout…" : "Sending your request…") : online ? "Buy package" : "Request package"}</Button>
              {error && <p id="pack-error" role="alert" className="text-sm text-burgundy">{error}</p>}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-soft">Sign in or create an account to request your package. Your choice is kept.</p>
              <ButtonLink href={`/signup?next=${encodeURIComponent(back)}&why=package`} className="w-full">Create a free account to request this package</ButtonLink>
              <p className="text-center text-sm text-ink-soft">Already a client? <Link href={`/login?next=${encodeURIComponent(back)}&why=package`} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">Sign in</Link></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
