import "server-only";
import { db } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { env } from "@/lib/env";
import { STUDIO_TZ, spokenDateTime, time } from "@/lib/time";

// Weekly repeat bookings: "every Monday 16:30 and Wednesday 19:00".
// Weekdays are ISO (1 = Monday) in studio time.

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parts = new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** ISO weekday + "HH:MM" of a class in studio time. */
export function slotOf(startsAt: string) {
  const p = parts.formatToParts(new Date(startsAt));
  const wd = DAYS.indexOf(p.find((x) => x.type === "weekday")!.value);
  return { weekday: wd, hhmm: `${p.find((x) => x.type === "hour")!.value}:${p.find((x) => x.type === "minute")!.value}` };
}

export const slotLabel = (weekday: number, hhmm: string) => `${DAYS[weekday]} ${hhmm.slice(0, 5)}`;

export async function recurringRules(profileId: string) {
  const { data } = await db().from("recurring_rules").select("id, class_type_id, weekday, start_time, class_types(name, credit_kind)")
    .eq("profile_id", profileId).eq("active", true).order("weekday").order("start_time");
  return data ?? [];
}

export async function recurringSummary(profileId: string) {
  return (await recurringRules(profileId)).map((r) => slotLabel(r.weekday, r.start_time));
}

/** The weekly slots on the timetable (class type + weekday + time) inside the booking window. */
export async function weeklySlots() {
  const cfg = await getSettings();
  const { data } = await db().from("class_sessions")
    .select("starts_at, class_type_id, class_types!inner(name, kind, credit_kind)")
    .eq("status", "scheduled").gt("starts_at", new Date().toISOString())
    .lt("starts_at", new Date(Date.now() + cfg.booking_window_days * 86_400_000).toISOString())
    .not("class_types.credit_kind", "is", null);
  const slots = new Map<string, { classTypeId: string; name: string; kind: string; creditKind: "reformer" | "mat"; weekday: number; hhmm: string }>();
  for (const s of data ?? []) {
    const { weekday, hhmm } = slotOf(s.starts_at);
    const key = `${s.class_type_id}|${weekday}|${hhmm}`;
    if (!slots.has(key)) slots.set(key, { classTypeId: s.class_type_id, name: s.class_types.name, kind: s.class_types.kind, creditKind: s.class_types.credit_kind!, weekday, hhmm });
  }
  return [...slots.values()].sort((a, b) => a.weekday - b.weekday || a.hhmm.localeCompare(b.hhmm));
}

/**
 * Book every upcoming class matching the client's weekly rules, inside the booking window
 * and while their package lasts. Classes they've already booked, cancelled or waitlisted
 * are left alone; full classes are skipped and the client gets a one-tap waitlist link.
 * Runs when rules are saved, when a package is marked paid, and on the background tick.
 */
export async function applyRecurring(profileId?: string) {
  let q = db().from("recurring_rules").select("id, profile_id, class_type_id, weekday, start_time, profiles(id, email, phone, full_name)").eq("active", true);
  if (profileId) q = q.eq("profile_id", profileId);
  const { data: rules } = await q;
  if (!rules?.length) return { booked: 0 };
  const cfg = await getSettings();
  const until = new Date(Date.now() + cfg.booking_window_days * 86_400_000).toISOString();
  const typeIds = [...new Set(rules.map((r) => r.class_type_id))];
  const { data: sessions } = await db().from("class_sessions").select("id, starts_at, class_type_id, title, class_types(name)")
    .in("class_type_id", typeIds).eq("status", "scheduled")
    .gt("starts_at", new Date(Date.now() + 60 * 60_000).toISOString()).lt("starts_at", until).order("starts_at");

  let total = 0;
  for (const pid of [...new Set(rules.map((r) => r.profile_id))]) {
    const mine = rules.filter((r) => r.profile_id === pid);
    const profile = mine[0].profiles!;
    const matches = (sessions ?? []).filter((s) => {
      const { weekday, hhmm } = slotOf(s.starts_at);
      return mine.some((r) => r.class_type_id === s.class_type_id && r.weekday === weekday && r.start_time.slice(0, 5) === hhmm);
    });
    if (!matches.length) continue;
    const ids = matches.map((s) => s.id);
    const [{ data: had }, { data: waiting }] = await Promise.all([
      db().from("bookings").select("session_id").eq("profile_id", pid).in("session_id", ids),
      db().from("waitlist_entries").select("session_id").eq("profile_id", pid).in("session_id", ids),
    ]);
    const skip = new Set([...(had ?? []), ...(waiting ?? [])].map((r) => r.session_id));
    const booked: string[] = [];
    for (const s of matches) {
      if (skip.has(s.id)) continue;
      const { error } = await db().rpc("book_session", { p_profile: pid, p_session: s.id, p_mode: "credit" });
      const name = s.title ?? s.class_types?.name ?? "Class";
      if (!error) { booked.push(`${spokenDateTime(s.starts_at).split(",")[0].split(" ").slice(0, 3).join(" ")} ${time(s.starts_at)}`); continue; }
      if (error.message === "full") {
        await notify({ profileId: pid, email: profile.email }, "weekly_full",
          { name: profile.full_name ?? undefined, className: name, when: spokenDateTime(s.starts_at), link: `${env.siteUrl}/book/${s.id}` },
          { dedupeKey: `weekly-full:${pid}:${s.id}`, sessionId: s.id });
        continue;
      }
      if (error.message === "no_credits" || error.message === "beyond_expiry") break; // package used up or ends before this class
    }
    if (booked.length) {
      total += booked.length;
      await notify({ profileId: pid, email: profile.email }, "weekly_booked",
        { name: profile.full_name ?? undefined, when: booked.join(", "), note: `Free cancellation up to ${cfg.cancellation_cutoff_hours}h before each class.` });
    }
  }
  return { booked: total };
}

/** Replace the client's weekly rules with the chosen slots, then book what's open. */
export async function saveRecurring(profileId: string, slots: { classTypeId: string; weekday: number; hhmm: string }[]) {
  await db().from("recurring_rules").update({ active: false }).eq("profile_id", profileId).eq("active", true);
  if (slots.length) {
    const { error } = await db().from("recurring_rules").insert(
      slots.map((s) => ({ profile_id: profileId, class_type_id: s.classTypeId, weekday: s.weekday, start_time: s.hhmm })),
    );
    if (error) throw error;
  }
  return applyRecurring(profileId);
}
