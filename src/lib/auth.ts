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
  let { data: profile } = await db().from("profiles").select("*").eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!profile) {
    // Trigger normally creates it; recover if the account predates the trigger.
    const { data: created } = await db().from("profiles").insert({ user_id: user.id, email: user.email?.toLowerCase() }).select("*").single();
    profile = created;
  }
  if (!profile) return null;
  return { userId: user.id, email: user.email ?? "", profile };
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
  return viewer;
}

export const getSettings = cache(async () => {
  const { data } = await db().from("studio_settings").select("*").eq("id", 1).single();
  return data!;
});
