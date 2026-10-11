"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

/** Offline packages don't auto-renew; this just records that the client won't renew. */
export async function toggleRenewal(membershipId: string, stop: boolean) {
  const viewer = await requireViewer("/membership");
  await db().from("memberships").update({ cancel_at_period_end: stop }).eq("id", membershipId).eq("profile_id", viewer.profile.id).eq("provider", "offline");
  revalidatePath("/membership");
}
