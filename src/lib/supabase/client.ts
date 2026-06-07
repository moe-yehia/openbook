import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Browser-side Supabase client (client components).
 * Uses the public anon key — safe to ship to the browser; RLS enforces access.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
