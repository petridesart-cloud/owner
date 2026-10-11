"use client";
import { useTransition } from "react";
import { removeTeamMember } from "../actions";

export function RemoveMember({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} aria-label={`Remove ${name} from the team`}
      onClick={() => { if (confirm(`Remove admin access for ${name}?`)) start(async () => { await removeTeamMember(id); }); }}
      className="min-h-10 rounded-full border border-burgundy/30 bg-white px-3 text-xs text-burgundy">Remove</button>
  );
}
