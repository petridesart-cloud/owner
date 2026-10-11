import { db } from "@/lib/supabase/admin";
import { addDaysKey, dayMonth, monthYear, todayKey } from "@/lib/time";
import { AdminTitle } from "../ui";
import { Builder } from "./Builder";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const [{ data: types }, { data: templates }] = await Promise.all([
    db().from("class_types").select("id, name").eq("active", true).neq("kind", "event").order("sort_order"),
    db().from("timetable_templates").select("id, name, valid_from, valid_to, created_at, template_slots(weekday, start_time, class_type_id)").order("created_at", { ascending: false }).limit(6),
  ]);
  const last = templates?.[0];
  const initial = (last?.template_slots ?? []).map((s) => ({ weekday: s.weekday, time: s.start_time.slice(0, 5), class_type_id: s.class_type_id }));

  // Default: next month (or the rest of this month if it's early).
  const [y, m] = todayKey().split("-").map(Number);
  const firstOf = (yy: number, mm: number): string => (mm > 12 ? firstOf(yy + 1, mm - 12) : `${yy}-${String(mm).padStart(2, "0")}-01`);
  const nextFirst = firstOf(y, m + 1);
  const nextLast = addDaysKey(firstOf(y, m + 2), -1);

  return (
    <div>
      <AdminTitle title="Timetable" sub="Set up a month's recurring classes. Starts from your last timetable; tweak the times and save." />
      <Builder types={types ?? []} initial={initial} defaults={{ name: `${monthYear(`${nextFirst}T12:00:00Z`)} timetable`, from: nextFirst, to: nextLast }} />
      {templates && templates.length > 0 && (
        <section className="mt-8">
          <h2 className="display mb-2 text-[0.95rem]">Previous timetables</h2>
          <ul className="card divide-y divide-line text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex justify-between px-4 py-3"><span className="text-ink">{t.name}</span><span className="text-ink-soft">{dayMonth(t.valid_from)} – {dayMonth(t.valid_to)} · {t.template_slots.length} slots</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">Saving never deletes existing classes or bookings. To change one class, edit it in Classes.</p>
        </section>
      )}
    </div>
  );
}
