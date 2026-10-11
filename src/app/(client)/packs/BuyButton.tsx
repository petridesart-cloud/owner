"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { buyPackAction } from "./actions";

export function BuyButton({ productId, label }: { productId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button className="mt-4 w-full" disabled={pending} aria-label={label} onClick={() => start(async () => {
        const res = await buyPackAction(productId);
        if (!res.ok) return setError(res.error);
        const url = res.data!.redirect;
        if (url.startsWith("http")) window.location.assign(url); else router.push(url);
      })}>{pending ? "Opening checkout…" : "Buy pack"}</Button>
      {error && <p role="alert" className="mt-2 text-xs text-burgundy">{error}</p>}
    </>
  );
}
