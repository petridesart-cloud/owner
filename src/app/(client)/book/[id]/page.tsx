import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Badge, ButtonLink, Eyebrow, Notice } from "@/components/ui";
import { spotsLabel } from "@/components/ClassRow";
import { getSettings, getViewer } from "@/lib/auth";
import { availability } from "@/lib/data";
import { db } from "@/lib/supabase/admin";
import { eur, vatLine } from "@/lib/money";
import { longDate, nowMs, relativeHours, time } from "@/lib/time";
import { BookActions } from "./BookActions";
import { getTexts } from "@/lib/content";
import { Flower } from "@/components/Flower";

export const metadata: Metadata = { title: "Book a class" };
export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { id } = await params;
  const { cancelled } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const { data: s } = await db().from("class_sessions").select("starts_at").eq("id", id).maybeSingle();
  if (!s) notFound();
  const start = new Date(s.starts_at);
  const [c] = await availability(new Date(start.getTime() - 1000), new Date(start.getTime() + 1000)).then((r) => r.filter((x) => x.id === id));
  if (!c) notFound();

  const [viewer, settings, texts] = await Promise.all([getViewer(), getSettings(), getTexts()]);
  const profile = viewer?.profile;
  const [booking, entry] = profile
    ? await Promise.all([
        db().from("bookings").select("id, status").eq("session_id", id).eq("profile_id", profile.id).eq("status", "confirmed").maybeSingle().then((r) => r.data),
        db().from("waitlist_entries").select("id, status, offer_expires_at, created_at").eq("session_id", id).eq("profile_id", profile.id).in("status", ["waiting", "offered"]).maybeSingle().then((r) => r.data),
      ])
    : [null, null];

  let position = 0;
  if (entry?.status === "waiting") {
    const { count } = await db().from("waitlist_entries").select("id", { count: "exact", head: true })
      .eq("session_id", id).eq("status", "waiting").lte("created_at", entry.created_at);
    position = count ?? 1;
  }

  const past = start <= new Date();
  const offered = entry?.status === "offered" && new Date(entry.offer_expires_at!) > new Date();
  const full = c.spots_left === 0 && !offered;
  const usable = profile && c.credit_kind
    ? (await db().rpc("usable_credits", { p_profile: profile.id, p_kind: c.credit_kind, p_class: c.starts_at })).data?.[0]
    : null;
  const creditCount = usable?.usable ?? 0;
  const blockedByExpiry = !!usable && usable.total > 0 && usable.usable === 0;
  const { data: closed } = await db().rpc("is_closed_on", { p_at: c.starts_at });
  const { data: ctype } = await db().from("class_types").select("credit_cost").eq("id", c.class_type_id).single();
  const next = `/book/${id}`;

  // Trial (first class of this type only) and drop-in, or a paid event: reserve now, pay by cash or Revolut.
  const { data: singleProducts } = c.credit_kind
    ? await db().from("products").select("tag, name, price_cents").eq("active", true).eq("credit_kind", c.credit_kind).in("tag", ["trial", "drop_in"]).order("sort_order")
    : { data: [] };
  let trialOk = false;
  if (profile && c.credit_kind && singleProducts?.some((p) => p.tag === "trial")) {
    const [{ count: classesOfType }, { count: trials }] = await Promise.all([
      db().from("bookings").select("id, class_sessions!inner(class_types!inner(credit_kind))", { count: "exact", head: true })
        .eq("profile_id", profile.id).in("status", ["held", "confirmed", "late_cancelled", "no_show"]).eq("class_sessions.class_types.credit_kind", c.credit_kind),
      db().from("payments").select("id, products!inner(tag, credit_kind)", { count: "exact", head: true })
        .eq("profile_id", profile.id).in("status", ["pending", "paid"]).eq("products.tag", "trial").eq("products.credit_kind", c.credit_kind),
    ]);
    trialOk = !classesOfType && !trials;
  }
  // Say up front what would otherwise only fail on tap: one unpaid class at a time; a package already requested.
  const [{ data: unpaid }, { data: requestedPack }] = profile && creditCount === 0
    ? await Promise.all([
        db().from("bookings").select("id, class_sessions!inner(starts_at, title, class_types(name))").eq("profile_id", profile.id)
          .eq("status", "confirmed").eq("paid_with", "pay_at_studio").gt("class_sessions.starts_at", new Date().toISOString()).limit(1).maybeSingle(),
        c.credit_kind
          ? db().from("payments").select("id, products!inner(credit_kind)").eq("profile_id", profile.id).eq("status", "pending")
              .is("booking_id", null).eq("products.credit_kind", c.credit_kind).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
    : [{ data: null }, { data: null }];
  const singles = unpaid ? [] : c.kind === "event"
    ? [{ mode: "drop_in" as const, label: "Reserve your spot", price: eur(c.price_cents) }]
    : (singleProducts ?? []).filter((p) => p.tag === "drop_in" || trialOk)
        .map((p) => ({ mode: p.tag as "trial" | "drop_in", label: p.tag === "trial" ? "Book your trial" : "Drop-in", price: eur(p.price_cents) }));

  return (
    <div className="relative min-h-[70dvh]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-lilac-100/80 to-transparent" />
      <div className="relative px-5 pt-3"><BackButton href="/schedule" /></div>
      <article className="animate-rise relative mx-2 mt-1 rounded-[var(--radius-sheet)] border border-line/80 bg-white/90 px-5 pb-8 pt-3 shadow-[var(--shadow-lift)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            {c.kind === "event" && <Eyebrow>Special event</Eyebrow>}
            <h1 className="mt-2 text-[2rem] leading-tight text-ink">
              {c.kind === "reformer" ? (
                <><span className="font-script text-[2.6rem] text-plum-700">Reformer</span> <span className="display text-[1.6rem]">Pilates</span></>
              ) : c.kind === "event" ? (
                <span className="font-script text-[2.6rem] text-plum-700">{c.title}</span>
              ) : (
                <span className="display text-[1.6rem]">{c.title}</span>
              )}
            </h1>
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-[0.95rem] text-ink">
          <div className="flex items-center gap-2.5"><dt><CalendarDays aria-label="When" size={17} className="text-ink-soft" /></dt>
            <dd><span className="font-medium">{longDate(c.starts_at)}</span> · {time(c.starts_at)}–{time(c.ends_at)}</dd></div>
          <div className="flex items-center gap-2.5"><dt><MapPin aria-label="Where" size={17} className="text-ink-soft" /></dt>
            <dd>{c.location ?? "Re·Form Studio"}</dd></div>
          <div className="flex items-center gap-2.5"><dt><Users aria-label="Spots" size={17} className="text-ink-soft" /></dt>
            <dd className={c.spots_left === 1 ? "font-medium text-plum-700" : ""}>{c.status === "cancelled" ? "Cancelled" : spotsLabel(c)}</dd></div>
        </dl>

        {c.description && <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-soft">{c.description}</p>}

        <section aria-labelledby="bring" className="mt-5 rounded-2xl border border-line bg-paper/70 px-4 py-3.5">
          <h2 id="bring" className="eyebrow">What to bring</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {texts.what_to_bring.map((w) => <li key={w} className="flex items-start gap-1.5"><Flower className="mt-[3px] size-3.5 shrink-0 text-plum-700/70" />{w}</li>)}
          </ul>
        </section>

        <div className="mt-6 border-t border-line pt-5">
          {cancelled && <div className="mb-4"><Notice>Payment cancelled. Your spot was released; you can try again below.</Notice></div>}

          {closed ? (
            <Notice>The studio is closed that day. Pick another class.</Notice>
          ) : c.status === "cancelled" ? (
            <Notice tone="error">This class has been cancelled by the studio.</Notice>
          ) : past ? (
            <Notice>This class has already started.</Notice>
          ) : !booking && start.getTime() > nowMs() + settings.booking_window_days * 86_400_000 ? (
            <Notice>Booking for this class opens {Math.round(settings.booking_window_days / 7)} weeks before, on {longDate(new Date(start.getTime() - settings.booking_window_days * 86_400_000))}.</Notice>
          ) : booking ? (
            <div className="space-y-3 text-center">
              <Badge tone="booked">You&apos;re booked</Badge>
              <p className="text-sm text-ink-soft">See you on the reformer. Manage or cancel in My classes.</p>
              <ButtonLink href="/bookings" variant="soft" className="w-full">My classes</ButtonLink>
            </div>
          ) : !viewer ? (
            <div className="space-y-3">
              <PriceSummary price={c.price_cents} settings={settings} />
              <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} className="w-full">Secure your spot</ButtonLink>
              <p className="text-center text-xs text-ink-soft">Sign in with your email to book. No password needed.</p>
            </div>
          ) : !profile?.onboarded_at ? (
            <ButtonLink href={`/welcome?next=${encodeURIComponent(next)}`} className="w-full">Add your details to book</ButtonLink>
          ) : !profile.date_of_birth ? (
            <div className="space-y-3">
              <Notice>One more detail: please add your date of birth before booking.</Notice>
              <ButtonLink href="/account?dob=1" className="w-full">Add date of birth</ButtonLink>
            </div>
          ) : entry?.status === "waiting" ? (
            <div className="space-y-3">
              <Notice>You&apos;re <strong>#{position}</strong> on the waitlist. If a spot opens, we&apos;ll book you in with a class from your package (or hold the spot for you for {Math.round(settings.waitlist_window_minutes / 60)}h) and email you.</Notice>
              <BookActions mode="leave" sessionId={id} entryId={entry.id} />
            </div>
          ) : full ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft">This class is full{c.waitlist_count ? ` and ${c.waitlist_count} ${c.waitlist_count === 1 ? "person is" : "people are"} waiting` : ""}. Join the waitlist: if a spot opens more than {settings.cancellation_cutoff_hours}h before class and you have a class in your package, we book you in automatically and email you. Otherwise we email you and hold the spot for you.</p>
              <BookActions mode="waitlist" sessionId={id} />
            </div>
          ) : (
            <div className="space-y-4">
              {offered && <Notice tone="success">A spot opened up for you. It&apos;s held until {time(entry!.offer_expires_at!)} ({relativeHours(entry!.offer_expires_at!)} left).</Notice>}
              {blockedByExpiry && (
                <Notice>Your package is valid until {longDate(new Date(new Date(usable!.latest_expiry!).getTime() - 1))}, so this class is after it. A new package will cover it.</Notice>
              )}
              {requestedPack && <Notice>Your package request is awaiting payment. As soon as it&apos;s confirmed you can book this class with it.</Notice>}
              {unpaid && (
                <Notice>
                  You have a class waiting for payment ({unpaid.class_sessions.title ?? unpaid.class_sessions.class_types?.name}, {longDate(unpaid.class_sessions.starts_at)}).
                  Once it&apos;s paid you can reserve another, or get a package.
                </Notice>
              )}
              {creditCount === 0 && !singles.length && !unpaid && !requestedPack && <PriceSummary price={c.price_cents} settings={settings} />}
              {creditCount === 0 && singles.length > 0 && <p className="text-sm text-ink-soft">Free cancellation up to {settings.cancellation_cutoff_hours}h before class. <Link href="/policy" className="underline underline-offset-4">Policies</Link></p>}
              {creditCount > 0 && <p className="text-sm text-ink-soft">Free cancellation up to {settings.cancellation_cutoff_hours}h before class.</p>}
              {(creditCount > 0 || singles.length > 0 || settings.online_payments_enabled || settings.allow_pay_later) && (
                <BookActions
                  mode="book" sessionId={id} priceLabel={eur(c.price_cents)} credits={creditCount}
                  creditKind={c.credit_kind} creditCost={ctype?.credit_cost ?? 1} offered={offered}
                  online={settings.online_payments_enabled} payLater={settings.allow_pay_later} singles={singles}
                />
              )}
              {c.credit_kind && creditCount === 0 && !requestedPack && (
                <ButtonLink href={c.credit_kind === "mat" ? "/packs?type=mat" : "/packs"} variant={singles.length ? "soft" : "primary"} className="w-full">Secure your package</ButtonLink>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function PriceSummary({ price, settings }: { price: number; settings: { vat_rate: number; vat_registered: boolean; cancellation_cutoff_hours: number; online_payments_enabled: boolean } }) {
  const vat = vatLine(price, Number(settings.vat_rate), settings.vat_registered);
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-ink">Single class</span>
        <span className="font-serif text-2xl text-ink">{eur(price)}</span>
      </div>
      {vat && <p className="mt-0.5 text-right text-xs text-ink-soft">{vat}</p>}
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Free cancellation up to {settings.cancellation_cutoff_hours} hours before class. Later cancellations aren&apos;t refunded.{" "}
        <Link href="/policy/payments" className="underline underline-offset-4">Cancellation policy</Link>
      </p>
    </div>
  );
}
