import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getProfile } from "@/lib/auth/user";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { DocumentTile } from "@/components/app/document-tile";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = createClient();
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, emoji, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(6);

  const firstName = (profile?.display_name || user?.email?.split("@")[0] || "there").split(" ")[0];
  const hasDocs = (docs?.length ?? 0) > 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-callout text-content-tertiary">Welcome back</p>
          <h1 className="font-display text-display-lg capitalize text-content-primary">
            {firstName}.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="accent">{profile?.streak_days ?? 0}-day streak</Pill>
        </div>
      </div>

      {/* Today's Move — the analytics hook (populates in Phase 7) */}
      <Card className="mt-8 overflow-hidden" elevation="e2">
        <div className="flex flex-col items-start gap-4 p-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-accent-subtle text-content-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
                Today&rsquo;s move
              </div>
              <p className="mt-1 max-w-md text-body-lg text-content-primary">
                {hasDocs
                  ? "Open a study space and let the tutor check what's slipping."
                  : "Bring in your first material — a PDF, a lecture, a link — and start an active session."}
              </p>
            </div>
          </div>
          <Button href={hasDocs ? "/library" : "/upload"} variant="primary" size="md">
            {hasDocs ? "Continue studying" : "Add material"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <div className="mt-12 flex items-center justify-between">
        <h2 className="font-display text-title-2 text-content-primary">Your study spaces</h2>
        {hasDocs && (
          <Link href="/library" className="text-callout text-content-secondary hover:text-content-primary">
            View all →
          </Link>
        )}
      </div>

      {hasDocs ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs!.map((d) => (
            <DocumentTile key={d.id} doc={d} />
          ))}
        </div>
      ) : (
        <Card className="mt-5 border-dashed" elevation="flat">
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <p className="max-w-sm text-body-lg text-content-secondary">
              Nothing here yet. Upload a document, paste a link, or drop in some notes — OpenBook
              turns it into an active study session.
            </p>
            <Button href="/upload" variant="primary" size="lg">
              Add your first material
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
