import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { Card, PageTitle } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { HealthWizard } from "./HealthWizard";

export const metadata: Metadata = { title: "Health questions" };
export const dynamic = "force-dynamic";

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "" } = await searchParams;
  const viewer = await requireViewer(`/health${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const p = viewer.profile;
  const { data: h } = await db().from("health_notes").select("conditions, details, injuries, pregnancy, pregnancy_weeks, postpartum_months, bp_meds, medication").eq("profile_id", p.id).maybeSingle();
  const signup = !!next;
  return (
    <div>
      {!signup && <div className="px-5 pt-3"><BackButton href="/account" /></div>}
      <PageTitle eyebrow={signup ? "Almost done" : undefined} title="Health questions">
        A quick check so your instructor can keep you safe. Only she can see your answers.
      </PageTitle>
      <div className="px-5">
        <Card className="px-5 py-5">
          <HealthWizard next={next} initial={{
            answered: !!p.parq_completed_at, conditions: h?.conditions ?? [], details: h?.details ?? h?.injuries ?? "",
            pregnancy: h?.pregnancy ?? "", pregnancyWeeks: h?.pregnancy_weeks?.toString() ?? "", postpartumMonths: h?.postpartum_months?.toString() ?? "",
            bpMeds: h?.bp_meds == null ? "" : h.bp_meds ? "yes" : "no", medication: h?.medication ?? "",
          }} />
        </Card>
      </div>
    </div>
  );
}
