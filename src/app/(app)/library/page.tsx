import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentTile } from "@/components/app/document-tile";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const supabase = createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, emoji, status, updated_at")
    .order("updated_at", { ascending: false });

  const hasDocs = (docs?.length ?? 0) > 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-content-primary">Library</h1>
          <p className="mt-1 text-body text-content-secondary">
            Every source you&rsquo;re learning from, in one place.
          </p>
        </div>
        <Button href="/upload" variant="primary" size="md">
          Add material
        </Button>
      </div>

      {hasDocs ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs!.map((d) => (
            <DocumentTile key={d.id} doc={d} />
          ))}
        </div>
      ) : (
        <Card className="mt-8 border-dashed" elevation="flat">
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
            <p className="max-w-sm text-body-lg text-content-secondary">
              Your library is empty. Add a document, a link, or paste notes to begin.
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
