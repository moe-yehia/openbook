import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StudyLadder } from "@/components/summary/study-ladder";

export default async function SummaryPage({ params }: { params: { docId: string } }) {
  const supabase = createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, emoji")
    .eq("id", params.docId)
    .single();
  if (!doc) notFound();

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
      </div>
      <div className="min-h-0 flex-1">
        <StudyLadder documentId={doc.id} />
      </div>
    </div>
  );
}
