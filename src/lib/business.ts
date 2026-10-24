import "server-only";
import type { Settings } from "@/lib/auth";
import { emailLive, env } from "@/lib/env";
import { schedulerHealthy } from "@/lib/scheduler";
import { db } from "@/lib/supabase/admin";

/** Placeholder text from the defaults ("[Owner full name]", hello@example.com, +357 00 000000). */
export const isPlaceholder = (v: string | null | undefined) => !v?.trim() || /\[.*\]|example\.(com|org)|00 000000/i.test(v);
const real = (v: string | null | undefined) => (isPlaceholder(v) ? null : v!.trim());

/** Business details for clients: placeholders become null, so they're never shown. */
export function business(s: Settings) {
  return {
    name: real(s.legal_name) ?? "Re·Form Pilates Studio",
    owner: real(s.trader_name),
    address: real(s.address),
    email: real(s.contact_email),
    phone: real(s.contact_phone),
  };
}

export type ReadinessItem = { label: string; ok: boolean; href: string; hint: string };

/** "Before your first client": what still blocks a real launch. */
export async function launchReadiness(s: Settings): Promise<ReadinessItem[]> {
  const { count } = await db().from("class_sessions").select("id", { count: "exact", head: true })
    .eq("status", "scheduled").gt("starts_at", new Date().toISOString())
    .lt("starts_at", new Date(Date.now() + 14 * 86_400_000).toISOString());
  const b = business(s);
  return [
    { label: "Your full name", ok: !!b.owner, href: "/admin/settings", hint: "Shown at the bottom of every page (required by EU law)." },
    { label: "Studio address", ok: !!b.address, href: "/admin/settings", hint: "Footer, terms and the map." },
    { label: "Contact email and phone", ok: !!b.email && !!b.phone, href: "/admin/settings", hint: "Where clients reach you." },
    { label: "How clients pay you", ok: !!s.revolut_link || !!s.bank_iban, href: "/admin/settings", hint: "Your Revolut link and/or IBAN." },
    { label: "Classes on the timetable", ok: (count ?? 0) > 0, href: "/admin/timetable", hint: "Set up the next weeks in Classes → Monthly timetable." },
    { label: "Emails switched on", ok: emailLive(), href: "/admin/outbox", hint: env.demoMode ? "Off in the demo by design." : "Needs the email key from your developer (see the launch guide)." },
    { label: "Automatic reminders running", ok: schedulerHealthy(s.last_cron_tick_at), href: "/admin/outbox", hint: "Runs every 5 minutes on its own." },
  ];
}
