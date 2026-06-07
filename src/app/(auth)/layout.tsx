import { Wordmark } from "@/components/ui/wordmark";
import { Halftone } from "@/components/ui/halftone";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-16">
      <Halftone from="top" opacity={0.05} />
      <div className="absolute left-6 top-6">
        <Wordmark />
      </div>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-float sm:p-9">
        {children}
      </div>
    </main>
  );
}
