import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { normEmail } from "@/lib/request-keys";
import { env } from "@/lib/env";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** The signed-in user and their profile, or null. Cached for the request. */
export const getViewer = cache(async (): Promise<{ userId: string; email: string; profile: Profile } | null> => {
  const supabase = await supabaseServer();
  // A-021: getClaims checks the token's signature locally (asymmetric signing keys), with no Auth round trip;
  // with a symmetric secret it falls back to one getUser call. The proxy has already refreshed an expiring token.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  // A-055: "not signed in" is null; a failure to reach Auth is an error (the error page), never a sign-out.
  if (!claims?.sub) {
    if (error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)) throw unavailable(error);
    return null;
  }
  const email = typeof claims.email === "string" ? claims.email : "";
  const profile = await ensureProfile(claims.sub, email);
  if (!profile) return null;
  return { userId: claims.sub, email, profile };
});

/**
 * The profile for a login account. An existing client record with the same email (DM/imported clients,
 * or after a demo reset) is linked only when `link` is set, i.e. the caller has just proven the email
 * (a code from the email, or the demo passwords). Without proof an unlinked record is never handed over:
 * the database links it when the email is confirmed (handle_user_confirmed).
 */
export async function ensureProfile(userId: string, email?: string | null, opts: { link?: boolean } = {}): Promise<Profile | null> {
  const { data: mine, error } = await db().from("profiles").select("*").eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (error) throw unavailable(error);
  if (mine) return mine;
  // WP13: with asymmetric keys a deleted login's token stays valid for up to an hour. Before a profile is created
  // or linked for this id (the only way such a token could act), check that the login still exists.
  if (!(await loginExists(userId))) return null;
  const address = email ? normEmail(email) : null;
  if (address) {
    const { data: other, error: e2 } = await db().from("profiles").select("id, user_id").eq("email", address).is("deleted_at", null).maybeSingle();
    if (e2) throw unavailable(e2);
    if (other) {
      if (!opts.link || other.user_id) return null;
      const { data: linked } = await db().from("profiles").update({ user_id: userId })
        .eq("id", other.id).is("user_id", null).select("*").maybeSingle();
      return linked;
    }
  }
  const { data: created } = await db().from("profiles").insert({ user_id: userId, email: address }).select("*").maybeSingle();
  return created;
}

/** Does this login still exist in Auth? A deleted or erased account's leftover token must never create a profile. */
export const loginExists = cache(async (userId: string): Promise<boolean> => {
  const { data, error } = await db().auth.admin.getUserById(userId);
  if (data?.user) return true;
  if (error && (error.status === 404 || error.code === "user_not_found")) return false;
  if (error) throw unavailable(error);
  return false;
});

export async function requireViewer(next = "/") {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireOnboarded(next = "/") {
  const viewer = await requireViewer(next);
  if (!viewer.profile.onboarded_at) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (viewer.profile.role !== "admin") redirect("/");
  // Studio pages only: one cheap check that the login behind the token still exists (the token can outlive it by an hour).
  if (!(await loginExists(viewer.userId))) redirect("/login?next=/admin");
  return viewer;
}

/**
 * May the signed-in studio member read health answers (A-001)? Only admins with `can_view_health`
 * (the instructor). HEALTH_VIEWER_EMAILS bootstraps it, like ADMIN_EMAILS. Others see only the flags.
 */
export const canViewHealth = cache(async (): Promise<boolean> => {
  const viewer = await getViewer();
  if (!viewer || viewer.profile.role !== "admin") return false;
  if (viewer.profile.can_view_health) return true;
  if (!env.healthViewerEmails.includes(normEmail(viewer.email))) return false;
  const { error } = await db().from("profiles").update({ can_view_health: true }).eq("id", viewer.profile.id);
  return !error;
});

export const getSettings = cache(async () => {
  const { data, error } = await db().from("studio_settings").select("*").eq("id", 1).single();
  if (error || !data) throw unavailable(error);
  return data;
});

/** A-055: a database hiccup is an error the error page handles, never a crash on `null` or a sign-out. */
export function unavailable(cause: unknown) {
  console.error("database unavailable", cause);
  return new Error("db_unavailable");
}
export type Settings = Awaited<ReturnType<typeof getSettings>>;
