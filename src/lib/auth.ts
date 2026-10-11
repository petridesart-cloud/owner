import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** The signed-in user and their profile, or null. Cached for the request. */
export const getViewer = cache(async (): Promise<{ userId: string; email: string; profile: Profile } | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const profile = await ensureProfile(user.id, user.email);
  if (!profile) return null;
  return { userId: user.id, email: user.email ?? "", profile };
});

/**
 * The profile for a login account. Links an existing client record with the same
 * email (DM/imported clients, or after a demo reset) before creating a new one.
 */
export async function ensureProfile(userId: string, email?: string | null): Promise<Profile | null> {
  const { data: mine } = await db().from("profiles").select("*").eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (mine) return mine;
  if (email) {
    const { data: linked } = await db().from("profiles").update({ user_id: userId })
      .ilike("email", email).is("user_id", null).is("deleted_at", null).select("*").maybeSingle();
    if (linked) return linked;
  }
  const { data: created } = await db().from("profiles").insert({ user_id: userId, email: email?.toLowerCase() }).select("*").single();
  return created;
}

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
  return viewer;
}

export const getSettings = cache(async () => {
  const { data } = await db().from("studio_settings").select("*").eq("id", 1).single();
  return data!;
});
