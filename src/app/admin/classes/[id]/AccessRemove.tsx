"use client";
import { useTransition } from "react";
import { removeEventAccess } from "../../actions";

export function AccessRemove({ sessionId, profileId, name }: { sessionId: string; profileId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await removeEventAccess(sessionId, profileId); })}
      className="min-h-10 rounded-full border border-line bg-white px-3 text-xs text-ink hover:bg-lilac-50" aria-label={`Remove ${name}`}>
      {pending ? "…" : "Remove"}
    </button>
  );
}
