import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Celebrate } from "@/components/Celebrate";
import { ShareButton } from "@/components/ShareButton";
import { Flower } from "@/components/Flower";
import { STUDIO_RULES } from "@/lib/policy";
import { ButtonLink, Notice } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { sessionInfo } from "@/lib/booking";
import { db } from "@/lib/supabase/admin";
import { longDate, time } from "@/lib/time";

export const metadata: Metadata = { title: "You're booked" };
export const dynamic = "force-dynamic";

export default async function Confirmed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("/bookings");
  const { data: b } = await db().from("bookings").select("*").eq("id", id).eq("profile_id", viewer.profile.id).maybeSingle();
  if (!b) notFound();
  const s = await sessionInfo(b.session_id);
  const confirmed = b.status === "confirmed";
  const { count: previous } = await db().from("bookings").select("id", { count: "exact", head: true })
    .eq("profile_id", viewer.profile.id).in("status", ["confirmed", "late_cancelled", "no_show"]).neq("id", b.id);
  const firstClass = (previous ?? 0) === 0;

  return (
    <div className="px-5 pt-10 text-center">
      {confirmed ? (
        <>
          <Celebrate />
          <p className="eyebrow mt-6 animate-rise [animation-delay:500ms]" role="status">Booking confirmed</p>
          <h1 className="mt-2 animate-rise font-script text-[3rem] leading-none text-plum-700 [animation-delay:560ms]">See you soon</h1>
          <p className="display mt-4 text-[1.1rem] text-ink">{s.name}</p>
          <p className="mt-1 text-ink-soft">{longDate(s.starts_at)} · {time(s.starts_at)}</p>
          {s.where && <p className="text-sm text-ink-soft">{s.where}</p>}
          <p className="mx-auto mt-6 max-w-xs text-sm leading-relaxed text-ink-soft">
            A confirmation is on its way to {viewer.profile.email}.
          </p>
          {firstClass ? (
            <section aria-labelledby="first" className="policy-grain mx-auto mt-6 max-w-sm animate-rise rounded-[var(--radius-card)] px-5 py-5 text-left [animation-delay:650ms]">
              <h2 id="first" className="font-serif text-2xl text-ink">Your first class</h2>
              <p className="mt-1 text-sm text-ink-soft">Here&apos;s what to expect. Small class, three reformers, all the attention.</p>
              <ul className="mt-3 space-y-2 text-sm text-ink">
                {[STUDIO_RULES[0], STUDIO_RULES[2], STUDIO_RULES[1], STUDIO_RULES[4]].map((r) => (
                  <li key={r} className="flex gap-2"><Flower className="mt-[3px] size-4 shrink-0 text-plum-700/80" />{r}</li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">Arrive 5–10 minutes early, grip socks on.</p>
          )}
          <div className="mx-auto mt-7 flex max-w-xs animate-rise flex-col gap-2.5 [animation-delay:700ms]">
            <a href={`/api/ics/${b.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-paper">
              <CalendarPlus aria-hidden size={18} /> Add to calendar
            </a>
            <div className="grid grid-cols-2 gap-2.5">
              <ShareButton url={`/book/${s.id}`} title={`${s.name} at Re·Form`} text={`I'm booked for ${s.name} at Re·Form Pilates. Join me?`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-white/70 px-4 text-[0.8rem] font-medium uppercase tracking-[0.16em] text-ink" />
              <ButtonLink href="/bookings" variant="ghost">My classes</ButtonLink>
            </div>
          </div>
        </>
      ) : b.status === "held" ? (
        <div className="mx-auto max-w-sm space-y-4">
          <Notice>We&apos;re confirming your payment… This page will update in a moment.</Notice>
          <meta httpEquiv="refresh" content="3" />
          <ButtonLink href="/bookings" variant="ghost" className="w-full">My classes</ButtonLink>
        </div>
      ) : (
        <div className="mx-auto max-w-sm space-y-4">
          <Notice tone="error">This booking wasn&apos;t completed. If you were charged, we&apos;ll refund you. Contact the studio with any questions.</Notice>
          <ButtonLink href="/schedule" className="w-full">Back to schedule</ButtonLink>
        </div>
      )}
    </div>
  );
}
