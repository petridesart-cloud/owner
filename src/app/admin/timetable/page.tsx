import { db } from "@/lib/supabase/admin";
import { addDaysKey, dayMonth, todayKey } from "@/lib/time";
import { AdminTitle } from "../ui";
import { Builder } from "./Builder";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const [{ data: types }, { data: templates }] = await Promise.all([
    db().from("class_types").select("id, name").eq("active", true).neq("kind", "event").order("sort_order"),
    db().from("timetable_templates").select("id, name, valid_from, valid_to, repeats, created_at, template_slots(weekday, start_time, class_type_id)").order("created_at", { ascending: false }).limit(6),
  ]);
  const last = templates?.[0];
  const initial = (last?.template_slots ?? []).map((s) => ({ weekday: s.weekday, time: s.start_time.slice(0, 5), class_type_id: s.class_type_id }));

  // A change starts tomorrow; a first timetable starts next month.
  const [y, m] = todayKey().split("-").map(Number);
  const firstOf = (yy: number, mm: number): string => (mm > 12 ? firstOf(yy + 1, mm - 12) : `${yy}-${String(mm).padStart(2, "0")}-01`);
  const current = templates?.find((t) => t.repeats);
  const start = current ? addDaysKey(todayKey(), 1) : firstOf(y, m + 1);

  return (
    <div>
      <AdminTitle back="/admin/classes" title="Timetable" sub="Your weekly classes. Set them once: they repeat every month by themselves. Change a single class in Classes." />
      {current && (
        <p className="card mb-4 px-4 py-3 text-sm text-ink">
          <span className="font-medium">Repeating every week</span> since {dayMonth(current.valid_from)}. Classes are ready until {dayMonth(current.valid_to)} and keep being added.
          <span className="mt-1 block text-ink-soft">To change the weekly pattern, edit the times below and save with a start date.</span>
        </p>
      )}
      <Builder types={types ?? []} initial={initial} defaults={{ name: `Timetable from ${dayMonth(start)}`, from: start }} />
      {templates && templates.length > 0 && (
        <section className="mt-8">
          <h2 className="display mb-2 text-[0.95rem]">Previous timetables</h2>
          <ul className="card divide-y divide-line text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex justify-between px-4 py-3"><span className="text-ink">{t.name}</span><span className="text-ink-soft">{t.repeats ? `from ${dayMonth(t.valid_from)}, repeating` : `${dayMonth(t.valid_from)} – ${dayMonth(t.valid_to)}`} · {t.template_slots.length} a week</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">A new timetable replaces the old one from its start date. Classes someone has already booked are always kept.</p>
        </section>
      )}
    </div>
  );
}
