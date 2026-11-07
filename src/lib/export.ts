import "server-only";
import { db } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/auth";
import { business } from "@/lib/business";

/** A-055 style: a failed read must never produce a quietly incomplete export. */
function rows<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) {
    console.error(`export: ${what} failed`, res.error);
    throw new Error("db_unavailable");
  }
  return res.data;
}

const HEALTH_WITHHELD = "[not included: only the instructor can export health answers]";

/**
 * GDPR art. 15/20 (A-063, A-059): everything the studio holds about one person, as plain JSON, with the
 * Art. 15 information (who, why, how long, who else sees it, their rights). Used by the client's own
 * download (Account → Privacy & data) and by the studio for people without a login.
 */
export async function exportProfile(profileId: string, opts: { health?: boolean } = {}) {
  // Health answers only for the person themselves or the instructor (can_view_health, A-001 / V-001).
  const withHealth = opts.health ?? true;
  const { data: profile, error } = await db().from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (error) throw new Error("db_unavailable");
  if (!profile) return null;
  const id = profile.id;
  const lots = rows(await db().from("credit_lots").select("id, credit_kind, total, remaining, expires_at, created_at, note").eq("profile_id", id), "lots") ?? [];
  const lotIds = lots.map((l) => l.id);
  const [health, healthHistory, consents, bookings, waitlist, ledger, freezes, payments, messages, about, weekly, rewards, memberships, events, audit] = await Promise.all([
    !withHealth ? Promise.resolve({ data: null, error: null }) : db().from("health_notes").select("note, injuries, medication, parq_yes, conditions, details, pregnancy, pregnancy_weeks, postpartum_months, bp_meds, clearance_needed, clearance_received_at, consent_at, updated_at").eq("profile_id", id).maybeSingle(),
    !withHealth ? Promise.resolve({ data: [], error: null }) : db().from("health_history").select("conditions, details, pregnancy, pregnancy_weeks, postpartum_months, bp_meds, medication, clearance_needed, created_at").eq("profile_id", id).order("created_at"),
    db().from("consents").select("type, granted, version, created_at").eq("profile_id", id).order("created_at"),
    db().from("bookings").select("status, source, paid_with, answer, note, created_at, cancelled_at, checked_in_at, class_sessions(starts_at, title, class_types(name))").eq("profile_id", id),
    db().from("waitlist_entries").select("status, created_at, offered_at, offer_expires_at, class_sessions(starts_at)").eq("profile_id", id),
    db().from("credit_ledger").select("credit_kind, delta, entry_type, note, created_at").eq("profile_id", id),
    lotIds.length ? db().from("lot_freezes").select("lot_id, starts_on, ends_on, reason, created_at").in("lot_id", lotIds) : Promise.resolve({ data: [], error: null }),
    db().from("payments").select("provider, provider_ref, amount_cents, vat_cents, currency, status, method, intended_method, description, discount_note, discount_codes(code), created_at, paid_at").eq("profile_id", id),
    db().from("notifications").select("channel, template, recipient, subject, body, status, created_at").eq("profile_id", id).order("created_at"),
    db().from("notifications").select("template, subject, body, created_at").eq("about_profile_id", id).is("profile_id", null).order("created_at"),
    db().from("recurring_rules").select("weekday, start_time, active, created_at, class_types(name)").eq("profile_id", id),
    db().from("discount_codes").select("code, kind, value, note, expires_on, active, created_at").eq("profile_id", id),
    db().from("memberships").select("status, provider, current_period_start, current_period_end, cancel_at_period_end, paused_at, created_at, products!memberships_product_id_fkey(name)").eq("profile_id", id),
    db().from("event_access").select("created_at, class_sessions(starts_at, title)").eq("profile_id", id),
    db().from("audit_log").select("action, details, created_at").or(`actor_profile_id.eq.${id},details->>profileId.eq.${id}`).order("created_at"),
  ]);
  // Login codes are never part of an export (they're secrets, not data about the person).
  const own = (rows(messages, "messages") ?? []).map((m) => (["login_code", "verify_email", "reset_code"].includes(m.template) ? { ...m, body: "[code not included]" } : m));
  let auth: Record<string, string | null> | null = null;
  if (profile.user_id) {
    const { data: u } = await db().auth.admin.getUserById(profile.user_id);
    if (u?.user) auth = { email: u.user.email ?? null, created_at: u.user.created_at, email_confirmed_at: u.user.email_confirmed_at ?? null, last_sign_in_at: u.user.last_sign_in_at ?? null };
  }
  const s = await getSettings();
  const b = business(s);
  const mine: Partial<typeof profile> = { ...profile };
  delete mine.user_id;
  return {
    exported_at: new Date().toISOString(),
    about: {
      controller: { name: b.name, owner: b.owner, address: b.address, email: b.email, phone: b.phone },
      purposes: [
        "Booking and running your classes, packages and events (contract).",
        "Health answers, only with your explicit consent, so your instructor can adapt exercises safely.",
        "Messages about your bookings (transactional emails), and news only if you opted in.",
        "Payment records, kept for bookkeeping (legal obligation).",
      ],
      retention: {
        messages_months: s.retention_messages_months, audit_log_months: s.retention_audit_months,
        event_answers_and_waitlist_months_after_class: s.retention_event_extras_months, personal_codes_months: s.retention_codes_months,
        health_months_after_last_class: s.retention_health_months, inactive_account_months: s.retention_inactive_months,
        payments_years_after_year_end: s.retention_payments_years, consent_records_years_after_erasure: s.retention_consents_years,
      },
      recipients: ["Supabase (database and sign-in, EU: Frankfurt)", "Vercel (hosting)", "Resend (email)", "The studio's own mailbox (studio alerts)"],
      rights: "You can ask for a copy, a correction or the deletion of your data, object to or restrict its use, and take it elsewhere. You can delete your account in Account → Privacy & data. You can also complain to the Cyprus Commissioner for Personal Data Protection.",
    },
    profile: mine,
    login: auth,
    health_info: withHealth ? rows(health, "health") : HEALTH_WITHHELD,
    health_info_history: withHealth ? rows(healthHistory, "health history") : HEALTH_WITHHELD,
    consents: rows(consents, "consents"),
    bookings: rows(bookings, "bookings"),
    waitlist: rows(waitlist, "waitlist"),
    event_access: rows(events, "event access"),
    weekly_bookings: rows(weekly, "weekly"),
    credit_lots: lots,
    package_freezes: rows(freezes, "freezes"),
    credit_history: rows(ledger, "ledger"),
    memberships: rows(memberships, "memberships"),
    payments: rows(payments, "payments"),
    rewards: rows(rewards, "rewards"),
    messages: own,
    studio_alerts_about_you: rows(about, "studio alerts"),
    studio_actions_about_you: rows(audit, "audit"),
  };
}
