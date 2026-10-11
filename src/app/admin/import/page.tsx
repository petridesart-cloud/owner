import { todayKey, addDaysKey } from "@/lib/time";
import { AdminTitle } from "../ui";
import { Importer } from "./Importer";

export default function ImportPage() {
  const t = todayKey();
  return (
    <div className="space-y-6">
      <AdminTitle title="Import" sub="Bring in your existing clients and timetable from a spreadsheet." />
      <section className="card px-5 py-5">
        <h2 className="display mb-3 text-[0.95rem]">Clients &amp; credit balances</h2>
        <Importer kind="clients" />
        <p className="mt-3 text-xs text-ink-soft">Existing clients are matched by email and updated. When imported clients sign in with the same email, their history and credits are linked automatically.</p>
      </section>
      <section className="card px-5 py-5">
        <h2 className="display mb-3 text-[0.95rem]">Weekly timetable</h2>
        <Importer kind="timetable" defaults={{ name: "Imported timetable", from: t, to: addDaysKey(t, 30) }} />
      </section>
    </div>
  );
}
