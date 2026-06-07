import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StudyView } from "@/components/flashcards/study-view";

export default async function FlashcardsPage({ params }: { params: { docId: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Document (RLS-scoped).
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, emoji")
    .eq("id", params.docId)
    .single();
  if (!doc) notFound();

  // The student's existing deck for this document (one per doc).
  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("owner_id", user.id)
    .eq("document_id", doc.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let totalCards = 0;
  let due: {
    id: string;
    front: string;
    back: string;
    origin: string;
    fsrs_state: string;
    due: string;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    last_review: string | null;
  }[] = [];

  if (deck?.id) {
    const { count } = await supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("deck_id", deck.id)
      .eq("is_suspended", false);
    totalCards = count ?? 0;

    // Only cards whose due <= now enter the study queue.
    const { data: dueRows } = await supabase
      .from("flashcards")
      .select(
        "id, front, back, origin, fsrs_state, due, stability, difficulty, reps, lapses, last_review"
      )
      .eq("owner_id", user.id)
      .eq("deck_id", deck.id)
      .eq("is_suspended", false)
      .lte("due", new Date().toISOString())
      .order("due", { ascending: true })
      .limit(40);
    due = dueRows ?? [];
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-5">
        <Link
          href={`/documents/${doc.id}`}
          className="inline-flex items-center gap-1.5 text-callout text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-content-tertiary">{doc.emoji || "📄"}</span>
          {doc.title}
        </Link>
        <span className="ml-auto text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          Flashcards
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <StudyView
          documentId={doc.id}
          deckId={deck?.id ?? null}
          initialDue={due}
          totalCards={totalCards}
        />
      </div>
    </div>
  );
}
