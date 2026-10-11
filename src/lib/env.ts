// Central feature flags. Anything missing falls back to a safe demo behaviour.
export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  stripeSecret: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  resendKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM || "Re·Form Pilates <hello@example.com>",
  twilioSid: process.env.TWILIO_ACCOUNT_SID,
  twilioToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFrom: process.env.TWILIO_FROM,
  cronSecret: process.env.CRON_SECRET,
  adminEmails: (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Demo mode: login codes are shown on screen and messages only go to the admin Outbox.
  demoMode: process.env.DEMO_MODE === "true",
};

export const paymentsLive = () => Boolean(env.stripeSecret);
export const emailLive = () => Boolean(env.resendKey) && !env.demoMode;
export const smsLive = () => Boolean(env.twilioSid && env.twilioToken && env.twilioFrom) && !env.demoMode;
