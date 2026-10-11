"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { bookAction } from "./book/[id]/actions";

export function RebookButton({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        disabled={pending || done}
        onClick={() => start(async () => {
          const res = await bookAction(sessionId, "credit");
          if (!res.ok) return setError(res.error);
          setDone(true);
          if (navigator.vibrate) navigator.vibrate(10);
          router.push(res.data!.redirect);
        })}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-[0.8rem] font-medium uppercase tracking-[0.16em] text-paper transition active:scale-[0.97] disabled:opacity-80"
      >
        {done ? <><Check aria-hidden size={17} /> Booked</> : pending ? "Booking…" : label}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-burgundy">{error}</p>}
    </>
  );
}
