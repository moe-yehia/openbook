import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

/**
 * Shared Anthropic client. Server-only.
 *
 * Model routing philosophy: pick the cheapest model that meets the task's
 * quality bar. Snappy UI assists -> fast; tutoring + reasoning -> balanced;
 * deep synthesis / hard pedagogy -> deep.
 */
export const anthropic = new Anthropic({
  apiKey: serverEnv.anthropicApiKey,
});

export const MODELS = serverEnv.models;

export type Tier = keyof typeof MODELS;

export function model(tier: Tier = "balanced") {
  return MODELS[tier];
}
