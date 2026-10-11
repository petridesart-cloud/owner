import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/auth";
import { MAGIC_TEXT, STUDIO_RULES, STUDIO_TEXT, WHAT_TO_BRING, paymentsPolicy, type SiteTexts } from "@/lib/policy";

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

/** The studio's editable texts, falling back to the defaults. */
export const getTexts = cache(async (): Promise<SiteTexts> => {
  const [settings, { data }] = await Promise.all([getSettings(), db().from("site_content").select("key, value")]);
  const v = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    studio_rules: v.has("studio_rules") ? lines(v.get("studio_rules")!) : STUDIO_RULES,
    payments_policy: v.has("payments_policy") ? lines(v.get("payments_policy")!) : paymentsPolicy(settings),
    what_to_bring: v.has("what_to_bring") ? lines(v.get("what_to_bring")!) : WHAT_TO_BRING,
    magic_text: v.get("magic_text") ?? MAGIC_TEXT,
    studio_text: v.get("studio_text") ?? STUDIO_TEXT,
  };
});
