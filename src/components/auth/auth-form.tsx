"use client";

import { useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import {
  signInWithPassword,
  signUp,
  signInWithMagicLink,
  signInWithProvider,
  type AuthState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? "One moment…" : label}
    </Button>
  );
}

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const action = mode === "login" ? signInWithPassword : signUp;
  const [state, formAction] = useFormState<AuthState, FormData>(action, {});
  const [altPending, startAlt] = useTransition();
  const [altMsg, setAltMsg] = useState<AuthState>({});
  const formRef = useRef<HTMLFormElement>(null);

  const banner = state.error || altMsg.error || state.message || altMsg.message;
  const isError = Boolean(state.error || altMsg.error);

  const magicLink = () => {
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("next", next);
    startAlt(async () => setAltMsg((await signInWithMagicLink({}, fd)) ?? {}));
  };
  const oauth = (provider: "google" | "github") => {
    startAlt(async () => {
      const res = await signInWithProvider(provider, next);
      if (res?.error) setAltMsg({ error: res.error });
    });
  };

  return (
    <div className="w-full">
      <h1 className="font-display text-title-1 text-content-primary">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-body text-content-secondary">
        {mode === "login"
          ? "Pick up where you left off."
          : "Start learning the way memory actually works."}
      </p>

      {banner && (
        <div
          role={isError ? "alert" : "status"}
          className={cn(
            "mt-5 flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-callout",
            isError
              ? "border-danger/30 bg-danger-subtle text-content-primary"
              : "border-success/30 bg-success-subtle text-content-primary"
          )}
        >
          {isError ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          )}
          <span>{banner}</span>
        </div>
      )}

      <form ref={formRef} action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1.5 block text-callout font-medium text-content-secondary">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@university.edu"
            className="h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-callout font-medium text-content-secondary">
            Password
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
            className="h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
          />
        </label>
        <SubmitButton label={mode === "login" ? "Sign in" : "Create account"} />
      </form>

      <div className="my-5 flex items-center gap-3 text-caption text-content-tertiary">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2.5">
        <button
          onClick={magicLink}
          disabled={altPending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-pill border border-border-strong bg-surface text-callout font-medium text-content-primary transition-colors hover:bg-surface-sunken disabled:opacity-50"
        >
          <Mail className="h-4 w-4" />
          Email me a magic link
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => oauth("google")}
            disabled={altPending}
            className="flex h-11 items-center justify-center rounded-pill border border-border-strong bg-surface text-callout font-medium text-content-primary transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            Google
          </button>
          <button
            onClick={() => oauth("github")}
            disabled={altPending}
            className="flex h-11 items-center justify-center rounded-pill border border-border-strong bg-surface text-callout font-medium text-content-primary transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            GitHub
          </button>
        </div>
      </div>

      <p className="mt-7 text-center text-callout text-content-secondary">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-content-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-content-primary hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
