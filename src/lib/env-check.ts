import { z } from "zod";

/**
 * A-057: the settings the real app needs, checked in one place. Only enforced with APP_ENV=production
 * (scripts/migrate.mjs applies the same rules at build time). Stripe and Twilio are all-or-none groups.
 */
const filled = z.string().min(1, "is missing");
const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().regex(/^https:\/\/[^/\s]+/, "must be the https address of the app"),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters"),
  NEXT_PUBLIC_SUPABASE_URL: filled,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: filled,
  SUPABASE_SERVICE_ROLE_KEY: filled,
  RESEND_API_KEY: filled,
  EMAIL_FROM: filled,
});

export function envProblems(e: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  if (e.APP_ENV !== "production") return out;
  const r = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, e[k] ?? ""])));
  if (!r.success) for (const i of r.error.issues) out.push(`${String(i.path[0])} ${i.message}`);
  for (const group of [["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]]) {
    const set = group.filter((k) => e[k]);
    if (set.length && set.length < group.length) out.push(`${group.join(", ")} must all be set together (missing ${group.filter((k) => !e[k]).join(", ")})`);
  }
  if (e.DEMO_ADMIN_CODE && /\D/.test(e.DEMO_ADMIN_CODE)) out.push("DEMO_ADMIN_CODE may only contain digits");
  return out;
}
