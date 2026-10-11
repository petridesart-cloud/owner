import { ActionForm } from "@/components/ActionForm";
import { db } from "@/lib/supabase/admin";
import { todayKey } from "@/lib/time";
import { createSession } from "../../actions";
import { AdminTitle } from "../../ui";
import { SessionFields } from "../SessionFields";

export default async function NewClassPage() {
  const { data: types } = await db().from("class_types").select("*").eq("active", true).order("sort_order");
  return (
    <div>
      <AdminTitle title="New class" sub="One-off class or special event. For the weekly schedule use Timetable." />
      <div className="card px-5 py-5">
        <ActionForm action={createSession} submit="Create class">
          <SessionFields types={types ?? []} d={{ date: todayKey(), time: "08:00" }} />
        </ActionForm>
      </div>
    </div>
  );
}
