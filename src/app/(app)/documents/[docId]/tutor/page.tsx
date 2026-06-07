import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TutorChat } from "@/components/tutor/tutor-chat";

export default async function TutorPage({ params }: { params: { docId: string } }) {
  const supabase = createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, emoji, starter_questions")
    .eq("id", params.docId)
    .single();
  if (!doc) notFound();

  const { data: concepts } = await supabase
    .from("concepts")
    .select("id, label")
    .eq("document_id", params.docId)
    .limit(30);

  const starters = (Array.isArray(doc.starter_questions) ? doc.starter_questions : [])
    .filter((q): q is string => typeof q === "string")
    .slice(0, 4);

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
      </div>
      <div className="min-h-0 flex-1">
        <TutorChat documentId={doc.id} starterQuestions={starters} concepts={concepts ?? []} />
      </div>
    </div>
  );
}
