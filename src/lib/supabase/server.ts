import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Server-side Supabase client (server components, route handlers, server actions).
 * Reads/writes the auth cookie so sessions stay in sync with the browser.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `setAll` was called from a Server Component — safe to ignore when
          // middleware is refreshing sessions.
        }
      },
    },
  });
}
