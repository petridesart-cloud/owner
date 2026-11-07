"use server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { bookAtStudio, bookFree, bookSingle, bookWithCredit, bookWithPayment, joinWaitlist, leaveWaitlist, saveAnswer } from "@/lib/booking";
import { messageFor, type ActionResult } from "@/lib/errors";
import { TOO_MANY, bookingLimited, rateLimited } from "@/lib/rate-limit";
import { findCode } from "@/lib/rewards";
import { db } from "@/lib/supabase/admin";
import type { Discount } from "@/lib/discount";
import { z } from "zod";
import { parse, uuid } from "@/lib/validate";

async function onboardedProfile() {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in first." } as const;
  if (!viewer.profile.onboarded_at) return { error: "Please complete your details first." } as const;
  if (!viewer.profile.date_of_birth) return { error: "Please add your date of birth in Account first." } as const;
  if (!viewer.profile.parq_completed_at) return { error: "Please answer the health questions in Account first." } as const;
  if (await bookingLimited(viewer.profile.id)) return { error: TOO_MANY } as const;
  return { profile: viewer.profile } as const;
}

export async function bookAction(
  sessionId: string, method: "credit" | "pay" | "studio" | "trial" | "drop_in" | "free", payBy: "cash" | "revolut" = "cash", answer = "", code: string | null = null,
): Promise<ActionResult<{ redirect: string }>> {
  const a = parse(z.object({ sessionId: uuid, method: z.enum(["credit", "pay", "studio", "trial", "drop_in", "free"]) }), { sessionId, method });
  if (!a.ok) return a;
  const v = await onboardedProfile();
  if ("error" in v) return { ok: false, error: v.error! };
  if (payBy !== "cash" && payBy !== "revolut") return { ok: false, error: "Please choose cash or Revolut." };
  const res = method === "credit" ? await bookWithCredit(v.profile, sessionId)
    : method === "studio" ? await bookAtStudio(v.profile, sessionId)
    : method === "free" ? await bookFree(v.profile, sessionId)
    : method === "trial" || method === "drop_in" ? await bookSingle(v.profile, sessionId, method, payBy, typeof code === "string" ? code.slice(0, 40) : null)
    : await bookWithPayment(v.profile, sessionId);
  if (res.ok && typeof answer === "string") await saveAnswer(v.profile.id, sessionId, answer);
  revalidatePath("/schedule");
  // A-020: a retry after a lost response finds the booking already made: that's a success, not an error.
  if (!res.ok && res.error === messageFor("already_booked")) {
    const { data: b } = await db().from("bookings").select("id").eq("profile_id", v.profile.id).eq("session_id", sessionId)
      .in("status", ["held", "confirmed"]).maybeSingle();
    if (b) return { ok: true, data: { redirect: `/bookings/${b.id}/confirmed` } };
  }
  return res;
}

/** "Have a code?" on a class or event: what it gives here (the real price is worked out again when booking). */
export async function checkSingleCodeAction(sessionId: string, modes: ("trial" | "drop_in")[], code: string): Promise<ActionResult<Discount>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in first." };
  if (await rateLimited("code_check", viewer.profile.id, 10, 15)) return { ok: false, error: TOO_MANY };
  const { data: s } = await db().from("class_sessions").select("class_types(kind)").eq("id", sessionId).maybeSingle();
  // Any of what's offered here: the code may be for drop-ins but not trials, for example.
  const targets = s?.class_types?.kind === "event" ? ["event" as const] : [...new Set((Array.isArray(modes) ? modes : []).filter((m) => m === "trial" || m === "drop_in"))];
  let found: Awaited<ReturnType<typeof findCode>> = { ok: false, error: "That code isn't valid." };
  for (const t of targets) {
    found = await findCode(viewer.profile.id, String(code ?? "").slice(0, 40), undefined, t);
    if (found.ok) break;
  }
  if (!found.ok) return found;
  if (found.discount.kind === "free_classes") return { ok: false, error: "Free classes are added to a package. Use this code on the Packages page." };
  const { id: _id, ...discount } = found.discount;
  void _id;
  return { ok: true, data: discount };
}

export async function joinWaitlistAction(sessionId: string): Promise<ActionResult<{ position: number }>> {
  const a = parse(uuid, sessionId);
  if (!a.ok) return a;
  const v = await onboardedProfile();
  if ("error" in v) return { ok: false, error: v.error! };
  const res = await joinWaitlist(v.profile, sessionId);
  revalidatePath(`/book/${sessionId}`);
  return res;
}

export async function leaveWaitlistAction(entryId: string, sessionId: string): Promise<ActionResult> {
  const a = parse(z.object({ entryId: uuid, sessionId: uuid }), { entryId, sessionId });
  if (!a.ok) return a;
  const v = await onboardedProfile();
  if ("error" in v) return { ok: false, error: v.error! };
  const res = await leaveWaitlist(v.profile, entryId);
  revalidatePath(`/book/${sessionId}`);
  return res;
}
