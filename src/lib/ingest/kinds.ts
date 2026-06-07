/** Client-safe helpers to classify an upload into a source kind + a default emoji. */

export type SourceKind =
  | "pdf"
  | "image"
  | "docx"
  | "pptx"
  | "code"
  | "notebook"
  | "markdown"
  | "youtube"
  | "github"
  | "gdoc";

export function kindFromFile(file: File): { kind: SourceKind; emoji: string } {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const mime = file.type;

  if (ext === "pdf" || mime === "application/pdf") return { kind: "pdf", emoji: "📕" };
  if (mime.startsWith("image/")) return { kind: "image", emoji: "🖼️" };
  if (ext === "docx" || ext === "doc") return { kind: "docx", emoji: "📝" };
  if (ext === "pptx" || ext === "ppt") return { kind: "pptx", emoji: "📊" };
  if (ext === "ipynb") return { kind: "notebook", emoji: "📓" };
  if (ext === "md" || ext === "markdown") return { kind: "markdown", emoji: "📄" };
  return { kind: "code", emoji: "💻" };
}

export function kindFromUrl(url: string): { kind: SourceKind; emoji: string } | null {
  if (/youtube\.com|youtu\.be/i.test(url)) return { kind: "youtube", emoji: "▶️" };
  if (/github\.com/i.test(url)) return { kind: "github", emoji: "🐙" };
  if (/docs\.google\.com/i.test(url)) return { kind: "gdoc", emoji: "📄" };
  return null;
}

export const ACCEPTED_FILE_TYPES =
  ".pdf,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.md,.markdown,.txt,.ipynb,.js,.ts,.tsx,.jsx,.py,.java,.go,.rb,.rs,.c,.cpp,.json,.yml,.yaml,.html,.css";
