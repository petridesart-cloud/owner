import Link from "next/link";
import { UserRound } from "lucide-react";
import { Wordmark } from "./Logo";
import { env } from "@/lib/env";

export function Header({ signedIn, isAdmin, banner }: { signedIn: boolean; isAdmin: boolean; banner?: string }) {
  return (
    <>
      {env.demoMode && (
        <p className="bg-ink px-4 py-1.5 text-center text-[0.7rem] tracking-wide text-paper">
          Demo preview · no real payments or messages
        </p>
      )}
      {banner && (
        <p role="status" className="bg-mauve-soft px-4 py-2 text-center text-sm text-ink">{banner}</p>
      )}
      <header className="glass sticky top-0 z-30 border-b border-line/60">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link href="/" className="flex min-h-11 items-center rounded-full px-1" aria-label="Re·Form home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link href="/admin" className="eyebrow inline-flex min-h-11 items-center rounded-full px-3 text-ink hover:bg-lilac-100">
                Studio
              </Link>
            )}
            <Link
              href={signedIn ? "/account" : "/login"}
              className="grid size-11 place-items-center rounded-full text-ink hover:bg-lilac-100"
              aria-label={signedIn ? "Your account" : "Sign in"}
            >
              <UserRound aria-hidden size={20} strokeWidth={1.6} />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
