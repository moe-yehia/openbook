import { FileText, FileType, Presentation, FileImage, Code2, Play, GitBranch, NotebookPen, Loader2 } from "lucide-react";
import { Pill } from "@/components/ui/pill";

type Source = {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  external_url: string | null;
};

const ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  pptx: Presentation,
  image: FileImage,
  code: Code2,
  notebook: NotebookPen,
  markdown: FileText,
  text: FileText,
  youtube: Play,
  github: GitBranch,
  gdoc: FileText,
};

export function SourcesList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((s) => {
        const Icon = ICON[s.kind] ?? FileText;
        const processing = s.status !== "ready" && s.status !== "failed";
        return (
          <li
            key={s.id}
            className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2"
          >
            <Icon className="h-4 w-4 shrink-0 text-content-tertiary" />
            <span className="min-w-0 flex-1 truncate text-callout text-content-primary">
              {s.title || s.kind}
            </span>
            {processing ? (
              <span className="inline-flex items-center gap-1 text-caption-sm text-content-tertiary">
                <Loader2 className="h-3 w-3 animate-spin" />
                {s.status}
              </span>
            ) : s.status === "failed" ? (
              <Pill tone="warning">failed</Pill>
            ) : (
              <Pill tone="success">ready</Pill>
            )}
          </li>
        );
      })}
    </ul>
  );
}
