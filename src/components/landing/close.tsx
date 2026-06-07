"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView } from "framer-motion";
import { UploadCloud, Link2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorPill, useReducedMotionSafe } from "./primitives";
import { kindFromFile, kindFromUrl, ACCEPTED_FILE_TYPES } from "@/lib/ingest/kinds";
import { cn } from "@/lib/utils";

const TYPES = ["PDF", "Word", "Slides", "Images", "Notebooks", "Code", "YouTube", "GitHub", "Notes"];

/**
 * The Close — the protagonist turns to face the visitor and its surface becomes
 * a real capture surface for ANY input (file / link / pasted notes). Since
 * ingestion needs an account, we stash the material and hand it through signup
 * so the first study session begins with what they brought.
 */
export function Close() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const reduced = useReducedMotionSafe();
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");

  function handoff(payload: Record<string, unknown>) {
    try {
      sessionStorage.setItem("ob-handoff", JSON.stringify(payload));
    } catch {
      /* private mode — fall through to a clean signup */
    }
    router.push(`/signup?next=${encodeURIComponent("/upload")}`);
  }

  const onFile = (file: File | null) => {
    if (!file) return;
    const { kind, emoji } = kindFromFile(file);
    handoff({ mode: "file", kind, emoji, title: file.name.replace(/\.[^.]+$/, "") });
  };

  const onPaste = () => {
    const value = paste.trim();
    if (!value) return;
    const link = kindFromUrl(value);
    if (link) {
      handoff({ mode: "link", kind: link.kind, emoji: link.emoji, url: value, title: "Imported link" });
    } else if (/^https?:\/\//i.test(value)) {
      // a URL we don't yet support as a connector → carry as a link to try
      handoff({ mode: "link", kind: "youtube", emoji: "🔗", url: value, title: "Imported link" });
    } else {
      handoff({ mode: "text", emoji: "📝", text: value, title: "Pasted notes" });
    }
  };

  return (
    <section id="start" className="relative mx-auto max-w-3xl px-6 py-32">
      <div ref={ref} className="flex flex-col items-center">
        <motion.div
          initial={reduced ? false : { rotateY: -26, opacity: 0 }}
          animate={inView ? { rotateY: 0, opacity: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1200 }}
          className="w-full max-w-md"
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "rounded-card border-2 border-dashed p-8 text-center shadow-float transition-colors duration-base",
              dragging ? "border-accent bg-accent-subtle" : "border-border-strong bg-surface"
            )}
          >
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mx-auto flex flex-col items-center gap-2"
            >
              <span className="grid h-12 w-12 place-items-center rounded-pill bg-surface-sunken">
                <UploadCloud className="h-6 w-6 text-content-secondary" />
              </span>
              <span className="font-display text-title-3 text-content-primary">
                Drop anything you&rsquo;re struggling with
              </span>
              <span className="text-caption text-content-tertiary">
                or click to browse files
              </span>
            </button>

            {/* paste a link or notes */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onPaste();
              }}
              className="mt-5 flex items-center gap-2 rounded-pill border border-border bg-surface-sunken px-3 py-1.5"
            >
              <Link2 className="h-4 w-4 shrink-0 text-content-tertiary" />
              <input
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="…or paste a link or your notes"
                aria-label="Paste a link or notes"
                className="min-w-0 flex-1 bg-transparent text-callout text-content-primary outline-none placeholder:text-content-tertiary"
              />
              <button type="submit" className="text-caption font-medium text-content-secondary hover:text-content-primary">
                Add
              </button>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {TYPES.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-pill border border-border px-2.5 py-0.5 text-caption-sm text-content-tertiary"
                >
                  {t === "Notes" && <FileText className="h-3 w-3" />}
                  {t}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="mt-6">
          <TutorPill text="Ready when you are." active={inView} />
        </div>

        <h2 className="mt-12 text-balance text-center font-display text-display-xl text-content-primary">
          Stop reading.
          <br />
          Start learning.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/signup" size="lg" variant="primary">
            Create your free account
          </Button>
          <Button href="/login" size="lg" variant="ghost">
            I already have an account
          </Button>
        </div>
      </div>
    </section>
  );
}
