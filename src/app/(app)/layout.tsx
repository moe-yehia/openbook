import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/auth/user";
import { getRegister } from "@/lib/register";
import { AppNav } from "@/components/app/app-nav";
import { RegisterPill } from "@/components/comms/register-pill";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  const register = getRegister((profile?.prefs as { register?: string } | null)?.register);

  return (
    <div className="min-h-screen">
      <AppNav name={profile?.display_name ?? ""} email={user.email ?? ""} />
      {children}
      <RegisterPill currentRegister={register.id} />
    </div>
  );
}
