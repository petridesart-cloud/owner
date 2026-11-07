import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

// Her photos live in the project's public Storage bucket; next/image resizes them (A-052).
const storage = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""); } catch { return null; } })();
const localStorageHost = !!storage && ["127.0.0.1", "localhost"].includes(storage.hostname);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: storage ? [{ protocol: storage.protocol.replace(":", "") as "http" | "https", hostname: storage.hostname, port: storage.port, pathname: "/storage/v1/object/public/media/**" }] : [],
    dangerouslyAllowLocalIP: localStorageHost, // only when the dev database itself is local
  },
  // Fonts read at runtime by the icon / Open Graph image routes.
  outputFileTracingIncludes: { "/*": ["./src/assets/fonts/**"] },
  // Photos are resized in the browser (≤1600px JPEG) before upload; this leaves headroom. It applies to
  // every server action (A-094): accepted because only signed-in admins can upload, the bucket caps files
  // at 5 MB, and the per-email/IP auth limits keep anonymous posts small and few. Moving the upload to a
  // route handler would let this go back to the 1 MB default.
  // staleTimes (A-023): a page visited a moment ago is reused for 30 s when going back and forth; every page is per-user and dynamic.
  experimental: { serverActions: { bodySizeLimit: "6mb" }, staleTimes: { dynamic: 30 } },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
