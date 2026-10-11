"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox } from "@/components/ui";
import { buyPackAction } from "./actions";

/** Terms tick + buy. Online: goes to checkout. Offline: records a pay-at-the-studio request. */
export function BuyButton({ productId, label, cta, terms }: { productId: string; label: string; cta: string; terms: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `terms-${productId}`;
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl bg-lilac-50 px-4 py-3 text-sm leading-relaxed text-ink">{terms}</div>
      <Checkbox id={id} checked={accepted} onChange={(e) => setAccepted(e.target.checked)}>
        I accept these package terms and the <a href="/legal/terms" target="_blank" className="font-medium underline underline-offset-4">Terms</a>.
      </Checkbox>
      <Button className="w-full" disabled={pending || !accepted} aria-label={label} onClick={() => start(async () => {
        const res = await buyPackAction(productId, accepted);
        if (!res.ok) return setError(res.error);
        const url = res.data!.redirect;
        if (url.startsWith("http")) window.location.assign(url); else router.push(url);
      })}>{pending ? "One moment…" : cta}</Button>
      {error && <p role="alert" className="text-sm text-burgundy">{error}</p>}
    </div>
  );
}
