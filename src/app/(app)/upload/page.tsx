"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, Link2, UploadCloud, Loader2, File as FileIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { kindFromFile, kindFromUrl, ACCEPTED_FILE_TYPES } from "@/lib/ingest/kinds";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

type Mode = "text" | "file" | "link";

async function ingest(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Ingestion failed.");
  return json.documentId as string;
}

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Pick up material brought from the landing page through signup.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("ob-handoff");
      if (raw) sessionStorage.removeItem("ob-handoff");
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const h = JSON.parse(raw) as {
        mode?: Mode | "file";
        title?: string;
        emoji?: string;
        text?: string;
        url?: string;
      };
      if (h.title) setTitle(h.title);
      if (h.emoji) setEmoji(h.emoji);
      if (h.mode === "text") {
        setMode("text");
        if (h.text) setText(h.text);
      } else if (h.mode === "link") {
        setMode("link");
        if (h.url) setUrl(h.url);
      } else if (h.mode === "file") {
        setMode("file");
        setHandoffNote(`Re-select “${h.title ?? "your file"}” below to finish — files can’t be carried through sign-up.`);
      }
    } catch {
      /* ignore malformed handoff */
    }
  }, []);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Give your study space a title.");
    setBusy(true);
    try {
      if (mode === "text") {
        // Route text through the same pipeline as files/links so it gets
        // chunked, concept-seeded, and starter questions — needed by Quiz/Mind Map.
        if (text.trim().length < 20) {
          setBusy(false);
          return setError("Paste at least a paragraph of text to study.");
        }
        const id = await ingest({ kind: "text", title, emoji: emoji || "📝", text });
        router.push(`/documents/${id}`);
        return;
      }

      if (mode === "link") {
        const k = kindFromUrl(url);
        if (!k) {
          setBusy(false);
          return setError("Paste a YouTube, GitHub, or Google Docs link.");
        }
        const id = await ingest({ kind: k.kind, title, emoji: emoji || k.emoji, externalUrl: url });
        router.push(`/documents/${id}`);
        return;
      }

      // file
      if (!file) {
        setBusy(false);
        return setError("Choose a file to upload.");
      }
      const k = kindFromFile(file);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBusy(false);
        return setError("Your session expired — please sign in again.");
      }
      const path = `${user.id}/${crypto.randomUUID()}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("sources").upload(path, file);
      if (upErr) {
        setBusy(false);
        return setError(upErr.message);
      }
      const id = await ingest({
        kind: k.kind,
        title,
        emoji: emoji || k.emoji,
        storagePath: path,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      router.push(`/documents/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-display-lg text-content-primary">Add material</h1>
      <p className="mt-2 text-body-lg text-content-secondary">
        Bring in anything. OpenBook turns it into an active study session — never a passive summary.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          {error}
        </div>
      )}

      {handoffNote && (
        <div className="mt-4 rounded-md border border-info/30 bg-info-subtle px-3.5 py-3 text-callout text-content-primary">
          {handoffNote}
        </div>
      )}

      <div className="mt-7">
        <SegmentedControl<Mode>
          ariaLabel="Source type"
          options={[
            { value: "text", label: <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" /> Text</span> },
            { value: "file", label: <span className="inline-flex items-center gap-1.5"><UploadCloud className="h-4 w-4" /> File</span> },
            { value: "link", label: <span className="inline-flex items-center gap-1.5"><Link2 className="h-4 w-4" /> Link</span> },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div className="flex gap-3">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
            placeholder="📄"
            aria-label="Emoji"
            className="h-12 w-14 rounded-md border border-border-strong bg-surface text-center text-title-3 outline-none focus:border-focus-ring"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Give this study space a name"
            className="h-12 flex-1 rounded-md border border-border-strong bg-surface px-4 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
          />
        </div>

        {mode === "text" && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Paste your reading, lecture notes, an article…"
            className="w-full resize-y rounded-md border border-border-strong bg-surface p-4 text-body leading-relaxed text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
          />
        )}

        {mode === "link" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3.5">
              <Link2 className="h-4 w-4 text-content-tertiary" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
                placeholder="https://youtube.com/watch?v=…  or a GitHub repo"
                className="h-12 flex-1 bg-transparent text-body text-content-primary outline-none placeholder:text-content-tertiary"
              />
            </div>
            <p className="text-caption text-content-tertiary">
              YouTube (transcript), GitHub (repo), or Google Docs. We fetch and process it for you.
            </p>
          </div>
        )}

        {mode === "file" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed p-10 text-center transition-colors",
              dragging ? "border-accent bg-accent-subtle" : "border-border-strong bg-surface hover:bg-surface-sunken"
            )}
          >
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <FileIcon className="h-8 w-8 text-content-secondary" />
                <div className="text-body font-medium text-content-primary">{file.name}</div>
                <div className="text-caption text-content-tertiary">
                  {(file.size / 1024).toFixed(0)} KB · click to replace
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-content-tertiary" />
                <div className="text-body text-content-primary">Drop a file or click to browse</div>
                <div className="text-caption text-content-tertiary">
                  PDF, Word, slides, images, notebooks, code, Markdown
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Working…
              </>
            ) : (
              "Create study space"
            )}
          </Button>
          <Button href="/library" variant="ghost" size="lg">
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
