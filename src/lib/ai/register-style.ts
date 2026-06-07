import { getRegisterStyle } from "@/lib/register";
import type { createClient } from "@/lib/supabase/server";

/**
 * The current user's voice register style block (BUILD_SPEC §7.9) — the
 * load-bearing line prepended to EVERY AI feature's system prompt so all
 * student-facing AI output speaks in the register they chose.
 *
 * Resilient by design: returns "" if there's no user or anything goes wrong,
 * so a missing register never breaks an AI call.
 */
export async function userRegisterStyle(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "";

    const { data: profile } = await supabase
      .from("profiles")
      .select("prefs")
      .eq("id", user.id)
      .single();

    const register = (profile?.prefs as { register?: string } | null)?.register ?? null;
    return getRegisterStyle(register);
  } catch {
    return "";
  }
}
