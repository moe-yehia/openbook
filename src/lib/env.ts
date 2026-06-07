/**
 * Centralized, typed access to environment variables.
 *
 * Build-safe by design: this module NEVER throws at import time. A production
 * build must not require runtime secrets to be present just to compile — if a
 * value is missing, it surfaces as a clear error when the Supabase/Anthropic
 * client is actually used, not as a cryptic "failed to collect page data".
 *
 * NEXT_PUBLIC_* values are still required at BUILD time on the host (Vercel) for
 * the browser bundle to work — set them in the project's environment variables.
 */

const isDev = process.env.NODE_ENV !== "production";

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  if ((!value || value.length === 0) && isDev && typeof window === "undefined") {
    console.warn(`[env] ${name} is not set — related features will not work until it is.`);
  }
  return value && value.length > 0 ? value : fallback;
}

export const env = {
  supabaseUrl: read("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  appUrl: read("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
};

/** Server-only secrets. Never import this into a client component. */
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  models: {
    fast: process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5",
    balanced: process.env.ANTHROPIC_MODEL_BALANCED ?? "claude-sonnet-4-6",
    deep: process.env.ANTHROPIC_MODEL_DEEP ?? "claude-opus-4-8",
  },
};
