"use server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { bookAtStudio, bookWithCredit, bookWithPayment, joinWaitlist, leaveWaitlist } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";

async function onboardedProfile() {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in first." } as const;
  if (!viewer.profile.onboarded_at) return { error: "Please complete your details first." } as const;
  return { profile: viewer.profile } as const;
}

export async function bookAction(sessionId: string, method: "credit" | "pay" | "studio"): Promise<ActionResult<{ redirect: string }>> {
  const v = await onboardedProfile();
  if ("error" in v) return { ok: false, error: v.error! };
  const res = method === "credit" ? await bookWithCredit(v.profile, sessionId)
    : method === "studio" ? await bookAtStudio(v.profile, sessionId)
    : await bookWithPayment(v.profile, sessionId);
  revalidatePath("/schedule");
  return res;
}

export async function joinWaitlistAction(sessionId: string): Promise<ActionResult<{ position: number }>> {
  const v = await onboardedProfile();
  if ("error" in v) return { ok: false, error: v.error! };
  const res = await joinWaitlist(v.profile, sessionId);
  revalidatePath(`/book/${sessionId}`);
  return res;
}

export async function leaveWaitlistAction(entryId: string, sessionId: string): Promise<ActionResult> {
  const v = await onboardedProfile();
  if ("error" in v) return { ok: false, error: v.error! };
  const res = await leaveWaitlist(v.profile, entryId);
  revalidatePath(`/book/${sessionId}`);
  return res;
}
