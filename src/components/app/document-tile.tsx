import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  title: string;
  emoji: string | null;
  status: string;
  updated_at?: string;
};

const statusTone: Record<string, "neutral" | "accent" | "success" | "warning" | "info"> = {
  ready: "success",
  queued: "info",
  parsing: "info",
  chunking: "info",
  embedding: "info",
  failed: "warning",
};

export function DocumentTile({ doc }: { doc: Doc }) {
  const tone = statusTone[doc.status] ?? "neutral";
  return (
    <Link
      href={`/documents/${doc.id}`}
      className={cn(
        "group flex flex-col justify-between rounded-card border border-border bg-surface p-5 shadow-e1",
        "transition-[transform,box-shadow] duration-fast hover:-translate-y-0.5 hover:shadow-e3"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-surface-sunken text-title-3">
          {doc.emoji || "📄"}
        </span>
        <Pill tone={tone}>{doc.status}</Pill>
      </div>
      <h3 className="mt-5 line-clamp-2 font-display text-title-3 text-content-primary">
        {doc.title}
      </h3>
      <span className="mt-3 text-caption text-content-tertiary transition-colors group-hover:text-content-secondary">
        Open study space →
      </span>
    </Link>
  );
}
