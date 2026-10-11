import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./types";

// Service-role client: bypasses RLS. Server-only; every caller must authorise first.
let client: ReturnType<typeof createClient<Database>> | null = null;
export function db() {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
