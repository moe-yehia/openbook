import { createClient } from "@supabase/supabase-js";
import { env, serverEnv } from "@/lib/env";

/**
 * Privileged service-role client — bypasses RLS. SERVER-ONLY.
 * Use for trusted background work (ingestion, embeddings, cron, admin tasks).
 * Never import this into a client component or expose the key to the browser.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
