"use server";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { onPaymentPaid } from "@/lib/booking";
import { paymentsLive } from "@/lib/env";

// Demo-only: simulates a successful payment when Stripe isn't configured.
export async function completeMockPayment(paymentId: string) {
  if (paymentsLive()) throw new Error("Mock payments are disabled when Stripe is configured");
  const viewer = await getViewer();
  const { data: pay } = await db().from("payments").select("*").eq("id", paymentId).single();
  if (!viewer || !pay || pay.profile_id !== viewer.profile.id || pay.provider !== "mock") redirect("/");
  await onPaymentPaid(paymentId, `mock_${paymentId}`);
  redirect(pay.purpose === "pack" ? `/bookings?purchased=${paymentId}` : `/bookings/${pay.booking_id}/confirmed`);
}

export async function abandonMockPayment(paymentId: string) {
  const viewer = await getViewer();
  const { data: pay } = await db().from("payments").select("*, bookings!payments_booking_id_fkey(session_id)").eq("id", paymentId).single();
  if (!viewer || !pay || pay.profile_id !== viewer.profile.id) redirect("/");
  await db().from("payments").update({ status: "cancelled" }).eq("id", paymentId).eq("status", "pending");
  if (pay.booking_id) {
    await db().rpc("cancel_booking", { p_booking: pay.booking_id, p_profile: viewer.profile.id });
    redirect(`/book/${pay.bookings?.session_id}?cancelled=1`);
  }
  redirect("/packs?cancelled=1");
}
