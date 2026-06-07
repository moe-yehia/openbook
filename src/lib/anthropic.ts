import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

/**
 * Shared Anthropic client. Server-only.
 *
 * Lazily constructed via a Proxy so that `new Anthropic()` is NEVER called at
 * import time — otherwise a missing ANTHROPIC_API_KEY would throw during
 * `next build` (when route modules are imported to collect page data). The real
 * client is built on first use; a missing key then surfaces as a clear 401 at
 * request time rather than a cryptic build failure.
 *
 * Model routing philosophy: pick the cheapest model that meets the task's
 * quality bar. Snappy UI assists -> fast; tutoring + reasoning -> balanced;
 * deep synthesis / hard pedagogy -> deep.
 */
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    // Non-empty placeholder avoids a constructor throw when the key is unset;
    // an actual API call then fails with a clear auth error instead.
    _client = new Anthropic({ apiKey: serverEnv.anthropicApiKey || "MISSING_ANTHROPIC_API_KEY" });
  }
  return _client;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const MODELS = serverEnv.models;

export type Tier = keyof typeof MODELS;

export function model(tier: Tier = "balanced") {
  return MODELS[tier];
}
