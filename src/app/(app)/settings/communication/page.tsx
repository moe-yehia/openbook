import type { Metadata } from "next";
import { getProfile } from "@/lib/auth/user";
import { getRegister } from "@/lib/register";
import { Calibration } from "@/components/comms/calibration";

export const metadata: Metadata = { title: "Communication mode" };

export default async function CommunicationSettingsPage() {
  const profile = await getProfile();
  const register = getRegister((profile?.prefs as { register?: string } | null)?.register);

  return (
    <main className="min-h-[calc(100vh-3.5rem)]">
      <Calibration currentRegister={register.id} />
    </main>
  );
}
