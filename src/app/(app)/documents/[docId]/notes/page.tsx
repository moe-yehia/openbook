import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatLoc } from "@/lib/rag/retrieve";
import { Notebook, type NoteRow, type InboxRow } from "@/components/notes/notebook";

type Relation = "relates_to" | "contradicts" | "example_of" | "prerequisite_of";

export default async function NotesPage({ params }: { params: { docId: string } }) {
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

  // Notes for this document, newest first.
  const { data: noteRows } = await supabase
    .from("notes")
    .select("id, title, body_student, body_synth, retrieval_prompt")
    .eq("document_id", doc.id)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const baseNotes = noteRows ?? [];
  const noteIds = baseNotes.map((n) => n.id);

  // Key-points, confirmed links, and schedules in three scoped queries.
  const keypointsByNote = new Map<string, { id: string; text: string }[]>();
  const linksByNote = new Map<
    string,
    { targetId: string; targetTitle: string; relation: Relation; rationale: string | null }[]
  >();
  const dueByNote = new Map<string, string | null>();

  if (noteIds.length > 0) {
    const titleById = new Map(baseNotes.map((n) => [n.id, n.title ?? "Untitled note"]));

    const [{ data: kps }, { data: links }, { data: scheds }] = await Promise.all([
      supabase
        .from("note_keypoints")
        .select("id, note_id, text, order_idx")
        .eq("owner_id", user.id)
        .in("note_id", noteIds)
        .order("order_idx", { ascending: true }),
      supabase
        .from("note_links")
        .select("source_note_id, target_note_id, relation, rationale, status")
        .eq("owner_id", user.id)
        .eq("status", "confirmed")
        .in("source_note_id", noteIds),
      supabase
        .from("note_schedule")
        .select("note_id, next_review_at")
        .eq("owner_id", user.id)
        .in("note_id", noteIds),
    ]);

    for (const k of kps ?? []) {
      const arr = keypointsByNote.get(k.note_id) ?? [];
      arr.push({ id: k.id, text: k.text });
      keypointsByNote.set(k.note_id, arr);
    }
    for (const l of links ?? []) {
      const arr = linksByNote.get(l.source_note_id) ?? [];
      arr.push({
        targetId: l.target_note_id,
        targetTitle: titleById.get(l.target_note_id) ?? "Untitled note",
        relation: l.relation as Relation,
        rationale: l.rationale,
      });
      linksByNote.set(l.source_note_id, arr);
    }
    for (const s of scheds ?? []) dueByNote.set(s.note_id, s.next_review_at);
  }

  const notes: NoteRow[] = baseNotes.map((n) => ({
    id: n.id,
    title: n.title,
    bodyStudent: n.body_student,
    bodySynth: n.body_synth,
    retrievalPrompt: n.retrieval_prompt,
    keypoints: keypointsByNote.get(n.id) ?? [],
    links: linksByNote.get(n.id) ?? [],
    dueAt: dueByNote.get(n.id) ?? null,
  }));

  // Inbox: highlights not yet forged into a note (raw material to think about).
  const { data: highlightRows } = await supabase
    .from("highlights")
    .select("id, quote, margin_note, loc, triage")
    .eq("document_id", doc.id)
    .eq("owner_id", user.id)
    .in("triage", ["inbox", "got_it", "confused"])
    .order("created_at", { ascending: false })
    .limit(40);

  const inbox: InboxRow[] = (highlightRows ?? []).map((h) => ({
    id: h.id,
    quote: h.quote,
    marginNote: h.margin_note,
    locLabel: formatLoc((h.loc as Record<string, unknown>) ?? {}),
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
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
          Notes
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Notebook documentId={doc.id} initialNotes={notes} inbox={inbox} />
      </div>
    </div>
  );
}
