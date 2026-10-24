import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { ButtonLink, Card, Notice, PageTitle } from "@/components/ui";
import { getSettings, requireOnboarded } from "@/lib/auth";
import { creditBalance } from "@/lib/data";
import { recurringRules, weeklySlots } from "@/lib/recurring";
import { WeeklyForm } from "./WeeklyForm";
import { db } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Every week" };
export const dynamic = "force-dynamic";

const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function WeeklyPage() {
  const viewer = await requireOnboarded("/bookings/weekly");
  const [slots, rules, credits, settings, { data: requested }] = await Promise.all([
    weeklySlots(), recurringRules(viewer.profile.id), creditBalance(viewer.profile.id), getSettings(),
    db().from("payments").select("products!inner(credit_kind)").eq("profile_id", viewer.profile.id).eq("status", "pending").is("booking_id", null),
  ]);
  // Classes of a kind they have, or have requested (booked automatically once it's paid).
  const canPick = new Set<string>([...(["reformer", "mat"] as const).filter((k) => credits[k] > 0), ...(requested ?? []).map((r) => r.products.credit_kind ?? "")]);
  const chosen = rules.map((r) => `${r.class_type_id}|${r.weekday}|${r.start_time.slice(0, 5)}`);
  const oneType = new Set(slots.map((s) => s.name)).size <= 1;
  const groups = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
    day: DAY[wd],
    slots: slots.filter((s) => s.weekday === wd).map((s) => ({
      key: `${s.classTypeId}|${s.weekday}|${s.hhmm}`, day: DAY[wd], time: s.hhmm, name: oneType ? "" : s.name,
      disabled: !canPick.has(s.creditKind) && !chosen.includes(`${s.classTypeId}|${s.weekday}|${s.hhmm}`),
    })),
  })).filter((g) => g.slots.length);
  const hasPackage = canPick.size > 0;

  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/bookings" /></div>
      <PageTitle eyebrow="Same days & times" title="Every week">
        Pick your days and times. We book them every week while your package lasts, up to {Math.round(settings.booking_window_days / 7)} weeks ahead, and keep booking new weeks as they open.
      </PageTitle>
      <div className="space-y-4 px-5">
        {!hasPackage ? (
          <Notice>You&apos;ll need a package first. Once it&apos;s paid, your weekly classes are booked automatically.</Notice>
        ) : (requested ?? []).length > 0 && credits.reformer + credits.mat === 0 && (
          <Notice>Pick your times now: they&apos;re booked automatically as soon as your package is paid.</Notice>
        )}
        <Card className="px-5 py-5">
          {groups.length ? <WeeklyForm groups={groups} chosen={chosen} /> : <p className="text-sm text-ink-soft">The timetable for the coming weeks isn&apos;t out yet.</p>}
        </Card>
        <p className="text-xs leading-relaxed text-ink-soft">
          If a class is full that week, we skip it and send you a link to join the waitlist. Cancel any single class as usual (free up to {settings.cancellation_cutoff_hours}h before).
        </p>
        {!hasPackage && <ButtonLink href="/packs" className="w-full">Secure your package</ButtonLink>}
      </div>
    </div>
  );
}
