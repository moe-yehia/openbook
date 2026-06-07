/**
 * Centralized, typed access to environment variables.
 * Fails fast at import time on the server if a required secret is missing.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    // Only throw on the server; client bundles only ever see NEXT_PUBLIC_* values.
    if (typeof window === "undefined") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return "";
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
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
