import "server-only";
import { getSettings } from "@/lib/auth";
import { env } from "@/lib/env";
import { notify } from "@/lib/notifications";
import { db } from "@/lib/supabase/admin";
import { spokenDateTime } from "@/lib/time";

/** Her note: an email to the studio whenever clients book, sign up, cancel, request a package or change their details. */
export type AlertKind = "bookings" | "signups" | "cancellations" | "requests" | "details";

async function to() {
  const s = await getSettings();
  if (s.alert_email?.trim()) return s.alert_email.trim();
  if (s.contact_email?.trim() && !/\[|example\.com/.test(s.contact_email)) return s.contact_email.trim();
  const { data } = await db().from("profiles").select("email").eq("role", "admin").not("email", "is", null).order("created_at").limit(1).maybeSingle();
  return data?.email ?? null;
}

/** Sends one studio alert, if that kind is switched on (Settings → Booking rules → Studio emails). Never throws. */
export async function alertStudio(kind: AlertKind, subject: string, lines: string[], opts: { path?: string; dedupeKey?: string; about?: string } = {}) {
  try {
    const s = await getSettings();
    const on = { bookings: s.alert_bookings, signups: s.alert_signups, cancellations: s.alert_cancellations, requests: s.alert_requests, details: s.alert_details }[kind];
    if (!on) return;
    const email = await to();
    if (!email) return;
    await notify({ email }, "studio_alert", { className: subject, note: lines.filter(Boolean).join("\n"), link: `${env.siteUrl}${opts.path ?? "/admin"}` },
      // Who it's about, so their erasure also erases this alert (A-010). From the client page path when not given.
      { dedupeKey: opts.dedupeKey ? `studio:${opts.dedupeKey}` : undefined, aboutProfileId: opts.about ?? opts.path?.match(/^\/admin\/clients\/([0-9a-f-]{36})/)?.[1] });
  } catch (e) {
    console.error("studio alert failed", e);
  }
}

/** "Maria Georgiou booked 07:00 Reformer Pilates, Tuesday 4 November" with how full the class is now. */
export async function alertBooking(who: { id?: string; full_name: string | null; email?: string | null }, sessionId: string, how: string, bookingId?: string) {
  const { data: s } = await db().from("class_sessions").select("id, starts_at, capacity, title, class_types(name, kind)").eq("id", sessionId).maybeSingle();
  if (!s) return;
  const { count } = await db().from("bookings").select("id", { count: "exact", head: true }).eq("session_id", sessionId).in("status", ["confirmed", "held"]);
  const name = s.title ?? s.class_types?.name ?? "Class";
  const event = s.class_types?.kind === "event";
  const first = count === 1;
  await alertStudio("bookings",
    `${event ? "Event booking" : first ? "First booking" : "New booking"}: ${name}, ${spokenDateTime(s.starts_at)}`,
    [
      `${who.full_name ?? who.email ?? "A client"} booked ${how}.`,
      first && !event ? "This class was empty until now." : "",
      `${count ?? 1} of ${s.capacity} booked.`,
    ],
    { path: `/admin/classes/${s.id}`, dedupeKey: bookingId ? `booked:${bookingId}` : undefined, about: who.id });
}
