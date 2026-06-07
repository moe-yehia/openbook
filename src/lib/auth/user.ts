import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  prefs: Record<string, unknown>;
  plan: string;
  streak_days: number;
};

/** The authenticated user (token-revalidated). Cached per request. */
export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The current user's profile row (RLS-scoped to self). Cached per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, prefs, plan, streak_days")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
});
