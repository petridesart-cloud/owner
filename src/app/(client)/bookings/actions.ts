"use server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { cancelBooking } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";
import { TOO_MANY, bookingLimited } from "@/lib/rate-limit";

export async function cancelAction(bookingId: string): Promise<ActionResult<{ status: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in again." };
  if (await bookingLimited(viewer.profile.id)) return { ok: false, error: TOO_MANY };
  const res = await cancelBooking(viewer.profile, bookingId);
  revalidatePath("/bookings");
  return res;
}
