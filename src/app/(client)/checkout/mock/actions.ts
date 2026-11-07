"use server";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { cancelBooking, onPaymentPaid } from "@/lib/booking";
import { env, paymentsLive } from "@/lib/env";

/** The test checkout exists only in demo mode, for the viewer's own pending test payment (A-040). */
async function mockPayment(paymentId: string) {
  if (!env.demoMode || paymentsLive()) redirect("/");
  const viewer = await getViewer();
  const { data: pay } = await db().from("payments").select("*, bookings!payments_booking_id_fkey(session_id)").eq("id", paymentId).single();
  if (!viewer || !pay || pay.profile_id !== viewer.profile.id || pay.provider !== "mock" || pay.status !== "pending") redirect("/");
  return { viewer, pay };
}

// Demo-only: simulates a successful payment when Stripe isn't configured.
export async function completeMockPayment(paymentId: string) {
  const { pay } = await mockPayment(paymentId);
  await onPaymentPaid(paymentId, `mock_${paymentId}`);
  redirect(pay.purpose === "booking" ? `/bookings/${pay.booking_id}/confirmed` : `/membership?started=${paymentId}`);
}

export async function abandonMockPayment(paymentId: string) {
  const { viewer, pay } = await mockPayment(paymentId);
  await db().from("payments").update({ status: "cancelled" }).eq("id", paymentId).eq("status", "pending");
  if (pay.booking_id) {
    // Through the normal cancel path: its rules (events, rate of cancels), studio alert and waitlist.
    await cancelBooking(viewer.profile, pay.booking_id);
    redirect(`/book/${pay.bookings?.session_id}?cancelled=1`);
  }
  redirect("/packs?cancelled=1");
}
