import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, ListTree, ListChecks, Layers, Network, NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/ui/pill";
import { IngestProgress } from "@/components/app/ingest-progress";
import { SourcesList } from "@/components/app/sources-list";
import { AddMaterial } from "@/components/app/add-material";
import { ReaderTutor } from "@/components/tutor/reader-tutor";
import { HighlightLayer } from "@/components/highlighter/highlight-layer";
import { DictionaryHover } from "@/components/dictionary/dictionary-hover";

const TOOLS = [
  { key: "tutor", label: "Tutor", icon: MessageSquare, soon: false },
  { key: "summary", label: "Summary", icon: ListTree, soon: false },
  { key: "quiz", label: "Quiz", icon: ListChecks, soon: false },
  { key: "flashcards", label: "Flashcards", icon: Layers, soon: false },
  { key: "mindmap", label: "Mind map", icon: Network, soon: false },
  { key: "notes", label: "Notes", icon: NotebookPen, soon: false },
];

export default async function DocumentReader({ params }: { params: { docId: string } }) {
  const supabase = createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, emoji, status, error")
    .eq("id", params.docId)
    .single();
  if (!doc) notFound();

  const [{ data: sources }, { data: chunks }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, kind, title, status, external_url, created_at")
      .eq("document_id", params.docId)
      .order("created_at", { ascending: true }),
    supabase
      .from("chunks")
      .select("id, ordinal, content, source_id")
      .eq("document_id", params.docId)
      .order("source_id", { ascending: true })
      .order("ordinal", { ascending: true }),
  ]);

  const hasChunks = (chunks?.length ?? 0) > 0;
  const multiSource = (sources?.length ?? 0) > 1;
  const processing = !hasChunks && doc.status !== "ready" && doc.status !== "failed";

  // Group chunks by source for a readable, sectioned transcript.
  const bySource = new Map<string, { id: string; ordinal: number; content: string }[]>();
  for (const c of chunks ?? []) {
    const arr = bySource.get(c.source_id) ?? [];
    arr.push(c);
    bySource.set(c.source_id, arr);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-callout text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Library
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-surface-sunken text-title-1">
            {doc.emoji || "📄"}
          </span>
          <div>
            <h1 className="font-display text-display-lg text-content-primary">{doc.title}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Pill tone={doc.status === "ready" ? "success" : doc.status === "failed" ? "warning" : "info"}>
                {doc.status}
              </Pill>
              <span className="text-caption text-content-tertiary">
                {sources?.length ?? 0} {sources?.length === 1 ? "source" : "sources"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Study tools */}
      <div className="mt-7 flex flex-wrap gap-2">
        {TOOLS.map((t) => {
          const cls =
            "inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-callout font-medium transition-colors";
          if (t.soon) {
            return (
              <button
                key={t.key}
                disabled
                title="Coming soon"
                className={`${cls} border-border bg-surface text-content-secondary opacity-55`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                <span className="text-caption-sm text-content-tertiary">soon</span>
              </button>
            );
          }
          return (
            <Link
              key={t.key}
              href={`/documents/${doc.id}/${t.key}`}
              className={`${cls} border-border-strong bg-surface text-content-primary hover:bg-surface-sunken`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {/* Materials in this study space */}
          <section className="mb-8">
            <h2 className="mb-3 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              Materials
            </h2>
            <div className="space-y-2">
              <SourcesList sources={sources ?? []} />
              <AddMaterial documentId={doc.id} />
            </div>
          </section>

          {/* Reader (per-source sections) */}
          <article className="max-w-prose">
            {hasChunks ? (
              <DictionaryHover documentId={doc.id}>
                <HighlightLayer documentId={doc.id}>
                  <div className="space-y-8">
                    {(sources ?? []).map((s) => {
                      const cs = bySource.get(s.id);
                      if (!cs || cs.length === 0) return null;
                      return (
                        <section key={s.id}>
                          {multiSource && (
                            <h3 className="mb-3 font-display text-title-3 text-content-primary">
                              {s.title || s.kind}
                            </h3>
                          )}
                          <div className="space-y-5">
                            {cs.map((c) => (
                              <p
                                key={c.id}
                                data-chunk-id={c.id}
                                data-source-id={s.id}
                                className="text-body-lg leading-relaxed text-content-primary"
                              >
                                {c.content}
                              </p>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </HighlightLayer>
              </DictionaryHover>
            ) : processing ? (
              <IngestProgress docId={doc.id} initialStatus={doc.status} />
            ) : doc.status === "failed" ? (
              <div className="rounded-card border border-danger/30 bg-danger-subtle p-8 text-body text-content-primary">
                <p className="font-medium">We couldn&rsquo;t process this source.</p>
                <p className="mt-1 text-content-secondary">{doc.error ?? "Please try a different file or link."}</p>
              </div>
            ) : (
              <div className="rounded-card border border-dashed border-border p-10 text-center text-body text-content-secondary">
                No readable text was captured yet. Add a source above to get started.
              </div>
            )}
          </article>
        </div>

        {/* Live AI tutor, right beside the text */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 h-[calc(100vh-6rem)]">
            <ReaderTutor documentId={doc.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
