"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { Provider } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type AuthState = { error?: string; message?: string };

const credentials = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  // Only allow internal paths (no open redirects).
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${env.appUrl}/confirm` },
  });
  if (error) return { error: error.message };

  // If the project has email confirmation off, a session already exists.
  if (data.session) redirect(safeNext(formData.get("next")));
  return { message: "Check your email to confirm your account, then sign in." };
}

export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };

  const supabase = createClient();
  const next = safeNext(formData.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${env.appUrl}/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };
  return { message: "Magic link sent — check your email." };
}

export async function signInWithProvider(provider: Provider, next: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${env.appUrl}/callback?next=${encodeURIComponent(safeNext(next))}`,
    },
  });
  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/");
}
