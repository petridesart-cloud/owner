import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/auth";
import { getTexts } from "@/lib/content";
import { must } from "@/lib/errors";
import { ACCEPTED_DOCS, cookiesText, privacyText, waiverText, type LegalDoc } from "@/lib/legal";
import { defaultTerms } from "@/lib/terms";

export type DocVersion = { id: string; doc: LegalDoc; version: number; created_at: string };

/** The text a client sees for a document right now: her edited text, or the default that follows her settings. */
export const docText = cache(async (doc: LegalDoc): Promise<string> => {
  const s = await getSettings();
  switch (doc) {
    case "terms": {
      const { data } = await db().from("site_content").select("value").eq("key", "terms").maybeSingle();
      return data?.value || defaultTerms(s);
    }
    case "studio_rules": return (await getTexts()).studio_rules.map((r) => `- ${r}`).join("\n");
    case "payments_policy": return (await getTexts()).payments_policy.map((r) => `- ${r}`).join("\n");
    case "waiver": return waiverText(s);
    case "privacy": return privacyText(s);
    case "cookies": return cookiesText();
  }
});

/**
 * The current version of a document (A-009). A text that changed (she edited it, or a setting it follows changed)
 * becomes a new version the first time it's shown or accepted; the same text keeps its version.
 */
export const currentVersion = cache(async (doc: LegalDoc): Promise<DocVersion> => {
  const res = await db().rpc("record_policy_version", { p_doc: doc, p_body: await docText(doc) });
  return must(res, "record_policy_version").data as unknown as DocVersion;
});

/** The documents accepted at sign-up and welcome, at their current versions. */
export async function acceptedVersions() {
  return Promise.all(ACCEPTED_DOCS.map((d) => currentVersion(d)));
}
