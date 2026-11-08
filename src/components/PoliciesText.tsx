import { Prose } from "@/components/Prose";
import { DOC_TITLE } from "@/lib/legal";
import { docText } from "@/lib/policy-versions";
import { MarkedText } from "@/lib/terms";

/** The four documents accepted at sign-up, rendered on the server for the in-page sheet. */
export async function PoliciesText() {
  const docs = ["studio_rules", "payments_policy", "terms", "waiver"] as const;
  const texts = await Promise.all(docs.map((d) => docText(d)));
  return (
    <div className="space-y-4">
      {docs.map((d, i) => (
        <section key={d} aria-label={DOC_TITLE[d]}>
          <h3 className="display mb-2 px-5 text-[0.95rem] text-ink">{DOC_TITLE[d]}</h3>
          <Prose><MarkedText text={texts[i]} /></Prose>
        </section>
      ))}
    </div>
  );
}
