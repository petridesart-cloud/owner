import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { buildCsp, CSP_HEADER } from "@/lib/csp";

// Keeps the Supabase auth session fresh (rotates the httpOnly cookies) and sends the CSP with a
// fresh nonce (A-043): set on the request too, so Next.js adds the nonce to its scripts.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, dev: process.env.NODE_ENV === "development" });
  request.headers.set("x-nonce", nonce);
  request.headers.set(CSP_HEADER, csp);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/stripe|api/csp-report|icon.svg|pwa-icon|manifest.webmanifest|opengraph-image|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
