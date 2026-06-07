import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return <AuthForm mode="signup" next={searchParams.next ?? "/dashboard"} />;
}
