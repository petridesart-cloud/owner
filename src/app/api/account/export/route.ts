import { getViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

// GDPR art. 15/20: everything we hold about the signed-in client, as JSON.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const id = viewer.profile.id;
  const [health, consents, bookings, waitlist, credits, ledger, payments, notifications, weekly] = await Promise.all([
    db().from("health_notes").select("note, injuries, medication, consent_at, updated_at").eq("profile_id", id).maybeSingle(),
    db().from("consents").select("type, granted, version, created_at").eq("profile_id", id).order("created_at"),
    db().from("bookings").select("status, source, paid_with, created_at, cancelled_at, checked_in_at, class_sessions(starts_at, title, class_types(name))").eq("profile_id", id),
    db().from("waitlist_entries").select("status, created_at, offered_at, class_sessions(starts_at)").eq("profile_id", id),
    db().from("credit_lots").select("credit_kind, total, remaining, expires_at, created_at, note").eq("profile_id", id),
    db().from("credit_ledger").select("credit_kind, delta, entry_type, note, created_at").eq("profile_id", id),
    db().from("payments").select("provider, amount_cents, vat_cents, currency, status, method, intended_method, description, created_at, paid_at").eq("profile_id", id),
    db().from("notifications").select("channel, template, subject, status, created_at").eq("profile_id", id),
    db().from("recurring_rules").select("weekday, start_time, active, created_at, class_types(name)").eq("profile_id", id),
  ]);
  // Instructor notes are included: they are personal data too.
  const profile: Partial<typeof viewer.profile> = { ...viewer.profile };
  delete profile.user_id;
  const body = {
    exported_at: new Date().toISOString(),
    controller: "Re·Form Pilates Studio",
    profile,
    health_info: health.data,
    weekly_bookings: weekly.data,
    consents: consents.data, bookings: bookings.data, waitlist: waitlist.data,
    credit_lots: credits.data, credit_history: ledger.data, payments: payments.data, messages: notifications.data,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="reform-my-data.json"', "Cache-Control": "no-store" },
  });
}
