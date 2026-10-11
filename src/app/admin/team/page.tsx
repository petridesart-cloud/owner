import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { addTeamMember } from "../actions";
import { AdminTitle } from "../ui";
import { RemoveMember } from "./RemoveMember";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const viewer = await requireAdmin();
  const { data: team } = await db().from("profiles").select("id, full_name, email, user_id").eq("role", "admin").is("deleted_at", null).order("created_at");
  return (
    <div className="space-y-6">
      <AdminTitle title="Studio team" sub="People who can open this admin. They sign in with their email." />
      <ul className="card divide-y divide-line">
        {(team ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span><span className="block font-medium text-ink">{m.full_name ?? m.email}</span><span className="text-ink-soft">{m.email}{!m.user_id ? " · hasn't signed in yet" : ""}{m.id === viewer.profile.id ? " · you" : ""}</span></span>
            {m.id !== viewer.profile.id && <RemoveMember id={m.id} name={m.email ?? "member"} />}
          </li>
        ))}
      </ul>
      <section className="card px-5 py-5">
        <h2 className="display mb-4 text-[0.95rem]">Add someone</h2>
        <ActionForm action={addTeamMember} submit="Give admin access" variant="soft">
          <Field id="name" label="Name (optional)"><input id="name" name="name" className={inputClass} /></Field>
          <Field id="email" label="Email"><input id="email" name="email" type="email" required className={inputClass} /></Field>
        </ActionForm>
      </section>
    </div>
  );
}
