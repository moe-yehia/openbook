"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Link2, UploadCloud, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { kindFromFile, kindFromUrl, ACCEPTED_FILE_TYPES } from "@/lib/ingest/kinds";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Mode = "file" | "link" | "text";

/** Add another material (file / link / notes) to an existing study space. */
export function AddMaterial({ documentId }: { documentId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("file");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingest(payload: Record<string, unknown>) {
    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, documentId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not add the material.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "text") {
        await ingest({ kind: "text", title: title.trim() || "Pasted notes", text });
      } else if (mode === "link") {
        const k = kindFromUrl(url);
        if (!k) throw new Error("Paste a YouTube, GitHub, or Google Docs link.");
        await ingest({ kind: k.kind, title: title.trim() || "Imported link", emoji: k.emoji, externalUrl: url });
      } else {
        if (!file) throw new Error("Choose a file.");
        const k = kindFromFile(file);
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Your session expired.");
        const path = `${user.id}/${crypto.randomUUID()}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("sources").upload(path, file);
        if (upErr) throw new Error(upErr.message);
        await ingest({
          kind: k.kind,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          emoji: k.emoji,
          storagePath: path,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
        });
      }
      // Reset + refresh to show the new source ingesting.
      setOpen(false);
      setTitle("");
      setUrl("");
      setText("");
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface px-3 py-2.5 text-callout font-medium text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content-primary"
      >
        <Plus className="h-4 w-4" />
        Add material
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-surface p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-callout font-medium text-content-primary">Add material</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-content-tertiary hover:text-content-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <SegmentedControl<Mode>
        size="sm"
        ariaLabel="Material type"
        options={[
          { value: "file", label: <span className="inline-flex items-center gap-1"><UploadCloud className="h-3.5 w-3.5" /> File</span> },
          { value: "link", label: <span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Link</span> },
          { value: "text", label: <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Text</span> },
        ]}
        value={mode}
        onChange={setMode}
        className="mb-3"
      />

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="mb-2 h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-callout text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
      />

      {mode === "file" && (
        <>
          <input ref={fileInput} type="file" accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileInput.current?.click()} className="h-9 w-full rounded-md border border-border-strong bg-surface-sunken px-3 text-left text-callout text-content-secondary hover:text-content-primary">
            {file ? file.name : "Choose a file…"}
          </button>
        </>
      )}
      {mode === "link" && (
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="YouTube / GitHub / Google Docs link" className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-callout text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring" />
      )}
      {mode === "text" && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste notes or an article…" className="w-full resize-y rounded-md border border-border-strong bg-surface p-3 text-callout text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring" />
      )}

      {error && <p className="mt-2 text-caption text-danger">{error}</p>}

      <Button type="submit" size="sm" variant="primary" disabled={busy} className="mt-3 w-full">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : "Add to this space"}
      </Button>
    </form>
  );
}
