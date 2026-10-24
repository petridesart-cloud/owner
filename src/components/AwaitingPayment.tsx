import { eur } from "@/lib/money";
import { paymentReference } from "@/lib/pricing";
import { dayMonth } from "@/lib/time";
import type { Settings } from "@/lib/auth";
import { Section } from "./ui";

type Pending = { id: string; description: string | null; amount_cents: number; created_at: string; booking_id: string | null; intended_method: string | null };

const METHOD: Record<string, string> = { cash: "Cash at the studio", revolut: "Revolut", bank_transfer: "Bank transfer", card_in_person: "Card at the studio" };

/** Package requests and drop-ins waiting for payment, with how to pay. */
export function AwaitingPayment({ pending, settings }: { pending: Pending[]; settings: Settings }) {
  if (!pending.length) return null;
  return (
    <Section title="Awaiting payment">
      <ul className="card divide-y divide-line">
        {pending.map((x) => (
          <li key={x.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink">{x.description}
                <span className="block text-ink-soft">
                  {x.intended_method ? `${METHOD[x.intended_method] ?? x.intended_method} · ` : ""}
                  {x.booking_id ? "pay before class" : `requested ${dayMonth(x.created_at)}, held ${settings.unpaid_request_expiry_hours}h`}
                </span>
              </span>
              <span className="font-serif text-xl text-ink">{eur(x.amount_cents)}</span>
            </div>
            <div className="rounded-2xl bg-lilac-50 px-3 py-2.5 leading-relaxed text-ink">
              {x.intended_method === "revolut" ? (
                <p>Send {eur(x.amount_cents)} with Revolut{settings.revolut_link ? "" : " (ask your instructor for her Revolut)"} and add the reference below. Your instructor confirms it{x.booking_id ? "" : " and your classes appear"}.</p>
              ) : x.intended_method === "bank_transfer" && settings.bank_iban ? (
                <p>Transfer {eur(x.amount_cents)} to {settings.bank_account_name || "Re·Form Pilates Studio"}, IBAN <span className="font-mono">{settings.bank_iban}</span>.</p>
              ) : (
                <p>Pay {eur(x.amount_cents)} in cash at the studio{x.booking_id ? " before class" : ""}. Your instructor marks it paid{x.booking_id ? "" : " and your classes appear"}.</p>
              )}
              <p className="mt-1 text-xs">Reference: <strong className="font-mono font-medium">{paymentReference(x.id)}</strong></p>
              {x.intended_method === "revolut" && settings.revolut_link && (
                <a href={settings.revolut_link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-xs font-medium uppercase tracking-[0.14em] text-paper">Pay with Revolut</a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
