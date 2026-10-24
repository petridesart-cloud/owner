import { Mail, MessageSquare } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Badge } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { emailFromOk, notificationsMode } from "@/lib/notifications";
import { emailLive, env } from "@/lib/env";
import { dayMonth, time } from "@/lib/time";
import { runTickNow, sendTestEmail } from "../actions";
import { AdminTitle } from "../ui";
import { getSettings } from "@/lib/auth";
import { ago, schedulerHealthy } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const [{ data: rows }, s] = await Promise.all([
    db().from("notifications").select("*").order("created_at", { ascending: false }).limit(60),
    getSettings(),
  ]);
  const schedulerOk = schedulerHealthy(s.last_cron_tick_at);
  return (
    <div>
      <AdminTitle back="/admin/settings" title="Outbox" sub={notificationsMode() === "outbox" ? "Demo mode: messages are logged here, not sent." : "Live: messages are sent via Resend / Twilio and logged here."} />
      <section className="card mb-4 space-y-3 px-4 py-4 text-sm" aria-label="Email status">
        <p className="flex items-center justify-between gap-3">
          <span className="font-medium text-ink">Email</span>
          <Badge tone={emailLive() && emailFromOk() ? "open" : env.demoMode ? "plain" : "full"}>
            {emailLive() ? (emailFromOk() ? "Live" : "Live · check sender") : env.demoMode ? "Demo: logged only" : "Not set up"}
          </Badge>
        </p>
        <p className="text-ink-soft">Sender: <span className="text-ink">{env.emailFrom}</span></p>
        {!env.demoMode && !emailLive() && <p className="text-burgundy">Clients can&apos;t sign in until email is set up (RESEND_API_KEY and EMAIL_FROM).</p>}
        {emailLive() && !emailFromOk() && <p className="text-burgundy">The sender address is a placeholder. Use an address on your own verified domain.</p>}
        <ActionForm action={sendTestEmail} submit="Send me a test email" variant="soft" />
        <p className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="font-medium text-ink">Automatic reminders</span>
          <Badge tone={schedulerOk ? "open" : "full"}>{s.last_cron_tick_at ? `Last ran ${ago(s.last_cron_tick_at)}` : "Not running yet"}</Badge>
        </p>
        <p className="text-ink-soft">Every 5 minutes: reminders, waitlist, expiring requests.</p>
      </section>
      <div className="mb-5"><ActionForm action={runTickNow} submit="Send due reminders & waitlist offers now" variant="ghost" /></div>
      <ul className="space-y-3">
        {(rows ?? []).map((n) => (
          <li key={n.id} className="card overflow-hidden">
            <details>
              <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lilac-100 text-ink">
                  {n.channel === "email" ? <Mail aria-label="Email" size={16} /> : <MessageSquare aria-label="SMS" size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{n.subject ?? n.body.slice(0, 70)}</span>
                  <span className="block truncate text-xs text-ink-soft">{n.template.replace(/_/g, " ")} → {n.recipient} · {dayMonth(n.created_at)} {time(n.created_at)}</span>
                </span>
                <Badge tone={n.status === "failed" ? "full" : n.status === "sent" ? "mauve" : "plain"}>{n.status}</Badge>
              </summary>
              <div className="border-t border-line bg-paper">
                {n.channel === "email" ? (
                  <iframe title={`Email preview: ${n.subject}`} srcDoc={n.body} sandbox="" className="h-[440px] w-full border-0" />
                ) : (
                  <p className="m-4 max-w-xs rounded-2xl rounded-bl-sm bg-lilac-100 px-4 py-3 text-sm text-ink">{n.body}</p>
                )}
                {n.error && <p className="px-4 pb-3 text-xs text-burgundy">{n.error}</p>}
              </div>
            </details>
          </li>
        ))}
        {rows?.length === 0 && <li className="card px-5 py-8 text-center text-sm text-ink-soft">No messages yet. Book a class to see confirmations appear here.</li>}
      </ul>
    </div>
  );
}
