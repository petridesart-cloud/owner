import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarPlus, Check } from "lucide-react";
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

  return (
    <div className="px-5 pt-10 text-center">
      {confirmed ? (
        <>
          <div className="animate-rise mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br from-lilac-300 to-mauve shadow-[var(--shadow-lift)]">
            <Check aria-hidden size={36} strokeWidth={1.6} className="text-ink" />
          </div>
          <p className="eyebrow mt-6">Booking confirmed</p>
          <h1 className="mt-2 font-script text-[3rem] leading-none text-plum-700">See you soon</h1>
          <p className="display mt-4 text-[1.1rem] text-ink">{s.name}</p>
          <p className="mt-1 text-ink-soft">{longDate(s.starts_at)} · {time(s.starts_at)}</p>
          {s.where && <p className="text-sm text-ink-soft">{s.where}</p>}
          <p className="mx-auto mt-6 max-w-xs text-sm leading-relaxed text-ink-soft">
            A confirmation is on its way to {viewer.profile.email}. Arrive 5 minutes early, grip socks on.
          </p>
          <div className="mx-auto mt-7 flex max-w-xs flex-col gap-2.5">
            <a href={`/api/ics/${b.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[0.8rem] font-medium uppercase tracking-[0.18em] text-paper">
              <CalendarPlus aria-hidden size={18} /> Add to calendar
            </a>
            <ButtonLink href="/bookings" variant="ghost">My classes</ButtonLink>
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
