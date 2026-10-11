"use server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { cancelBooking } from "@/lib/booking";
import type { ActionResult } from "@/lib/errors";

export async function cancelAction(bookingId: string): Promise<ActionResult<{ status: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in again." };
  const res = await cancelBooking(viewer.profile, bookingId);
  revalidatePath("/bookings");
  return res;
}
