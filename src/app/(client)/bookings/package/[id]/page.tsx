import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { packageDates } from "@/components/PackageCard";
import { Badge, Card, Section } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { clientPackages } from "@/lib/packages";
import { longDate, time } from "@/lib/time";

export const metadata: Metadata = { title: "My package" };
export const dynamic = "force-dynamic";

const STATUS = { upcoming: ["booked", "Booked"], attended: ["open", "Attended"], missed: ["waitlist", "Missed"] } as const;

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer(`/bookings/package/${id}`);
  const [p] = await clientPackages(viewer.profile.id, id);
  if (!p) notFound();

  return (
    <div>
      <div className="px-5 pt-3"><BackButton href="/bookings" /></div>
      <div className="px-5 pt-2">
        <Card className="overflow-hidden">
          <div className="lilac-wash px-5 py-6">
            <p className="eyebrow">{p.current ? "Current package" : "Past package"}</p>
            <h1 className="mt-1 font-serif text-[1.9rem] leading-tight text-ink">{p.title}</h1>
            <p className="mt-1 text-ink">{p.subtitle}</p>
            <p className="text-sm text-ink-soft">{packageDates(p)}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <Stat n={`${p.attended}/${p.total}`} label="attended" />
              <Stat n={p.missed} label="missed" />
              <Stat n={p.current ? p.remaining : p.expired} label={p.current ? "left" : "unused (expired)"} />
            </div>
          </div>
        </Card>
      </div>

      <Section title="Classes" className="mt-6">
        {p.classes.length ? (
          <ul className="card divide-y divide-line">
            {p.classes.map((c) => (
              <li key={c.bookingId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="block text-ink">{c.name}</span>
                  <span className="text-ink-soft">{longDate(c.startsAt)} · {time(c.startsAt)}</span>
                </span>
                <Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="px-5 py-6 text-sm text-ink-soft">No classes booked on this package yet. Its dates start with your first class.</Card>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">Classes cancelled in time went back to the package, so they aren&apos;t listed. Late cancellations and no-shows count as missed.</p>
      </Section>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-2 py-3">
      <p className="font-serif text-[1.7rem] leading-none text-ink">{n}</p>
      <p className="mt-1 text-[0.7rem] leading-tight text-ink-soft">{label}</p>
    </div>
  );
}
