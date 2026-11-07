"use client";
import { useTransition } from "react";
import { removeTeamInvite, removeTeamMember } from "../actions";

/** Remove a team member (by profile id) or a pending invite (by email). */
export function RemoveMember({ id, invite, name }: { id?: string; invite?: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} aria-label={`Remove ${name} from the team`}
      onClick={() => { if (confirm(`Remove admin access for ${name}?`)) start(async () => { if (invite) await removeTeamInvite(invite); else if (id) await removeTeamMember(id); }); }}
      className="min-h-11 rounded-full border border-burgundy/30 bg-white px-3 text-xs text-burgundy">Remove</button>
  );
}
