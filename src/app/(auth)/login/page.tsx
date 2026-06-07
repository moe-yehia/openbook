import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <>
      {searchParams.error && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary"
        >
          {searchParams.error}
        </div>
      )}
      <AuthForm mode="login" next={searchParams.next ?? "/dashboard"} />
    </>
  );
}
