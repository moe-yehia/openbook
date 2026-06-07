"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PenLine,
  Plus,
  Sparkles,
  Loader2,
  Quote,
  Lightbulb,
  Check,
  X,
  Link2,
  AlertTriangle,
  RotateCcw,
  Brain,
  ArrowRight,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

// ---------- types shared with the RSC loader ----------
export type NoteRow = {
  id: string;
  title: string | null;
  bodyStudent: string | null;
  bodySynth: string | null;
  retrievalPrompt: string | null;
  keypoints: { id: string; text: string }[];
  links: { targetId: string; targetTitle: string; relation: Relation; rationale: string | null }[];
  dueAt: string | null;
};

export type InboxRow = {
  id: string;
  quote: string;
  marginNote: string | null;
  locLabel: string;
};

type Relation = "relates_to" | "contradicts" | "example_of" | "prerequisite_of";

const RELATION_LABEL: Record<Relation, string> = {
  relates_to: "relates to",
  contradicts: "contradicts",
  example_of: "example of",
  prerequisite_of: "prerequisite of",
};

type LinkSuggestion = {
  targetId: string;
  targetTitle: string;
  relation: Relation;
  rationale: string;
};

const isDue = (dueAt: string | null) => !!dueAt && new Date(dueAt).getTime() <= Date.now();

export function Notebook({
  documentId,
  initialNotes,
  inbox,
}: {
  documentId: string;
  initialNotes: NoteRow[];
  inbox: InboxRow[];
}) {
  const [notes, setNotes] = useState<NoteRow[]>(initialNotes);
  const [railOpen, setRailOpen] = useState(false);
  const [forge, setForge] = useState<{ quote: string | null; originHighlightId: string | null } | null>(
    null
  );
  const [recallId, setRecallId] = useState<string | null>(null);

  const dueCount = notes.filter((n) => isDue(n.dueAt) && n.keypoints.length > 0).length;
  const recallNote = notes.find((n) => n.id === recallId) ?? null;

  const upsertNote = useCallback((next: NoteRow) => {
    setNotes((prev) => {
      const i = prev.findIndex((n) => n.id === next.id);
      if (i === -1) return [next, ...prev];
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }, []);

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[auto_1fr]">
      {/* LEFT — collapsible source / inbox rail */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface-sunken/40 transition-[width] duration-base ease-standard lg:flex",
          railOpen ? "w-72" : "w-12"
        )}
      >
        <button
          onClick={() => setRailOpen((o) => !o)}
          aria-label={railOpen ? "Collapse inbox" : "Open inbox"}
          className="flex h-11 shrink-0 items-center gap-2 px-3 text-content-tertiary hover:text-content-primary"
        >
          {railOpen ? (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span className="text-caption-sm uppercase tracking-[0.12em]">Inbox</span>
              {inbox.length > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-sunken px-1.5 text-caption-sm font-semibold text-content-secondary">
                  {inbox.length}
                </span>
              )}
            </>
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>

        {railOpen && (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <p className="mb-3 text-caption text-content-tertiary">
              Highlights waiting to become notes. A highlight is a prompt to think — drag nothing,
              just forge it.
            </p>
            {inbox.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-caption text-content-tertiary">
                <Inbox className="mx-auto mb-1.5 h-4 w-4" />
                Nothing in your inbox.
              </div>
            ) : (
              <div className="space-y-2.5">
                {inbox.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg border border-border bg-surface p-3 shadow-e1"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-caption-sm text-content-tertiary">
                      <Quote className="h-3 w-3" /> {h.locLabel}
                    </div>
                    <p className="line-clamp-4 text-caption text-content-secondary">{h.quote}</p>
                    <button
                      onClick={() =>
                        setForge({ quote: h.quote, originHighlightId: h.id })
                      }
                      className="mt-2 inline-flex items-center gap-1 text-caption-sm font-medium text-content-primary hover:text-accent-foreground"
                    >
                      <PenLine className="h-3 w-3" /> Forge a note
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* CENTER — Concept Canvas */}
      <section className="min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-title-1 text-content-primary">Your notebook</h1>
              <p className="mt-1.5 text-body text-content-secondary">
                You write the note in your own words. Claude only organizes — it never writes the
                explanation for you.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dueCount > 0 && (
                <Pill tone="accent" icon={<Brain className="h-3.5 w-3.5" />}>
                  {dueCount} due
                </Pill>
              )}
              <Button onClick={() => setForge({ quote: null, originHighlightId: null })}>
                <Plus className="h-4 w-4" /> New note
              </Button>
            </div>
          </div>

          {notes.length === 0 ? (
            <EmptyCanvas onStart={() => setForge({ quote: null, originHighlightId: null })} />
          ) : (
            <div className="mt-8 space-y-3">
              {notes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  due={isDue(n.dueAt) && n.keypoints.length > 0}
                  onRecall={() => setRecallId(n.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Note Forge — centered glassmorphic composer over a dimmed backdrop */}
      {forge && (
        <NoteForge
          documentId={documentId}
          quote={forge.quote}
          originHighlightId={forge.originHighlightId}
          existingCount={notes.length}
          onClose={() => setForge(null)}
          onSaved={(note) => upsertNote(note)}
        />
      )}

      {/* Quick Recall — hides the body, shows title + prompt */}
      {recallNote && (
        <QuickRecall
          note={recallNote}
          onClose={() => setRecallId(null)}
          onGraded={(nextDue) =>
            upsertNote({ ...recallNote, dueAt: nextDue })
          }
        />
      )}
    </div>
  );
}

// ============================================================ EMPTY CANVAS
function EmptyCanvas({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-10 rounded-card border border-dashed border-border bg-surface/60 p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-pill bg-accent-subtle">
        <PenLine className="h-6 w-6 text-content-primary" />
      </span>
      <h2 className="mt-4 font-display text-title-3 text-content-primary">
        A notebook you keep being quizzed on
      </h2>
      <p className="mx-auto mt-2 max-w-md text-body text-content-secondary">
        Start a note and Claude hands you one retrieval prompt — &ldquo;in your own words,
        why&hellip;?&rdquo;. You write the answer. Claude tightens your wording, links it to your
        other notes, and brings it back right before you&rsquo;d forget.
      </p>
      <Button variant="accent" className="mt-6" onClick={onStart}>
        <Sparkles className="h-4 w-4" /> Start your first note
      </Button>
    </div>
  );
}

// ============================================================ NOTE CARD
function NoteCard({
  note,
  due,
  onRecall,
}: {
  note: NoteRow;
  due: boolean;
  onRecall: () => void;
}) {
  const body = note.bodySynth ?? note.bodyStudent ?? "";
  return (
    <article
      className={cn(
        "rounded-card border bg-surface p-5 shadow-e1 transition-[transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-e3",
        due ? "border-accent-ring" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-title-3 text-content-primary">
          {note.title ?? "Untitled note"}
        </h3>
        {due && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-subtle px-2.5 py-1 text-caption-sm font-semibold uppercase tracking-[0.05em] text-content-primary ring-1 ring-accent-ring/60">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Recall due
          </span>
        )}
      </div>

      {body && (
        <p className="mt-2 line-clamp-3 text-body text-content-secondary">{body}</p>
      )}

      {note.keypoints.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {note.keypoints.map((k) => (
            <li key={k.id} className="flex items-start gap-2 text-callout text-content-primary">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-content-tertiary" />
              {k.text}
            </li>
          ))}
        </ul>
      )}

      {note.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {note.links.map((l, i) => (
            <span
              key={`${l.targetId}-${l.relation}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-sunken px-2.5 py-1 text-caption-sm text-content-secondary"
            >
              <Link2 className="h-3 w-3 text-content-tertiary" />
              {RELATION_LABEL[l.relation]} <span className="text-content-primary">{l.targetTitle}</span>
            </span>
          ))}
        </div>
      )}

      {note.keypoints.length > 0 && (
        <div className="mt-4">
          <button
            onClick={onRecall}
            className="inline-flex items-center gap-1.5 text-callout font-medium text-content-secondary hover:text-content-primary"
          >
            <Brain className="h-4 w-4" /> Quick Recall
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </article>
  );
}

// ============================================================ NOTE FORGE
type ForgePhase = "write" | "synthesizing" | "review" | "linking";

function NoteForge({
  documentId,
  quote,
  originHighlightId,
  existingCount,
  onClose,
  onSaved,
}: {
  documentId: string;
  quote: string | null;
  originHighlightId: string | null;
  existingCount: number;
  onClose: () => void;
  onSaved: (note: NoteRow) => void;
}) {
  const [phase, setPhase] = useState<ForgePhase>("write");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Streaming synthesis state.
  const [streamText, setStreamText] = useState("");
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [synthFailed, setSynthFailed] = useState(false);

  // Review (accept) state.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [draftSynth, setDraftSynth] = useState<string | null>(null);
  const [draftKeypoints, setDraftKeypoints] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(false);

  // Link suggestions.
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch the retrieval prompt on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prompt", documentId, quote: quote ?? undefined }),
        });
        const data = await res.json();
        if (!cancelled) setPrompt(typeof data.prompt === "string" ? data.prompt : null);
      } catch {
        if (!cancelled)
          setPrompt("In your own words, explain the key idea here — don't look back.");
      } finally {
        if (!cancelled) setPromptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, quote]);

  async function getHint() {
    if (hintLoading) return;
    setHintLoading(true);
    setHint(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hint",
          documentId,
          retrievalPrompt: prompt ?? "",
          quote: quote ?? undefined,
          draft: draft.trim() || undefined,
        }),
      });
      const data = await res.json();
      setHint(typeof data.hint === "string" ? data.hint : "Think about the core mechanism first.");
    } catch {
      setHint("Think about the core mechanism, then put it in your own words.");
    } finally {
      setHintLoading(false);
    }
  }

  async function synthesize() {
    const body = draft.trim();
    if (!body) return;
    setPhase("synthesizing");
    setError(null);
    setSynthFailed(false);
    setStreamText("");

    let noteId: string | null = null;
    let terminal = false;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "synthesize",
          documentId,
          bodyStudent: body,
          retrievalPrompt: prompt ?? undefined,
          quote: quote ?? undefined,
          originHighlightId: originHighlightId ?? undefined,
        }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "Synthesis failed.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!raw.trim()) continue;
          let ev: {
            type: string;
            noteId?: string;
            text?: string;
            title?: string | null;
            bodySynth?: string | null;
            keypoints?: string[];
            flags?: string[];
            message?: string;
          };
          try {
            ev = JSON.parse(raw);
          } catch {
            continue;
          }
          if (ev.type === "saved" && ev.noteId) {
            noteId = ev.noteId;
            setSavedNoteId(ev.noteId);
          } else if (ev.type === "delta" && ev.text) {
            setStreamText((s) => s + ev.text);
          } else if (ev.type === "done") {
            terminal = true;
            setDraftTitle(ev.title ?? null);
            setDraftSynth(ev.bodySynth ?? null);
            setDraftKeypoints(ev.keypoints ?? []);
            setFlags(ev.flags ?? []);
            setPhase("review");
          } else if (ev.type === "error") {
            // The note was saved with body_student — never lose the writing.
            terminal = true;
            setSynthFailed(true);
            setError(ev.message ?? "Synthesis failed.");
            setPhase("review");
          }
        }
      }
      // Stream ended without a terminal event — keep the saved note, offer retry.
      if (!terminal && noteId) {
        setSynthFailed(true);
        setPhase("review");
      }
    } catch (e) {
      // If the note id arrived, body_student is already safe; otherwise the
      // student's draft is still in the textarea and nothing is lost.
      setSynthFailed(true);
      setError(e instanceof Error ? e.message : "Synthesis failed.");
      if (noteId) setPhase("review");
      else setPhase("write");
    }
  }

  // Build the NoteRow the canvas should show right now (synth optional).
  function buildRow(noteId: string, keypointTexts: string[]): NoteRow {
    return {
      id: noteId,
      title: draftTitle ?? (draft.trim().slice(0, 60) || "Untitled note"),
      bodyStudent: draft.trim(),
      bodySynth: draftSynth,
      retrievalPrompt: prompt,
      keypoints: keypointTexts.map((text, i) => ({ id: `kp-${i}`, text })),
      links: [],
      dueAt: keypointTexts.length > 0 ? new Date().toISOString() : null,
    };
  }

  async function accept() {
    if (!savedNoteId || accepting) return;
    setAccepting(true);
    setError(null);
    const keypointTexts = draftKeypoints.filter((k) => k.trim());
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          noteId: savedNoteId,
          title: draftTitle,
          bodySynth: draftSynth,
          keypoints: keypointTexts,
        }),
      });
      if (!res.ok) throw new Error("Could not save.");
      const row = buildRow(savedNoteId, keypointTexts);
      onSaved(row);
      // Offer connections if there are other notes to link to.
      if (existingCount > 0) {
        setPhase("linking");
        void fetchLinks(savedNoteId);
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setAccepting(false);
    }
  }

  // Keep the student's writing even if they skip synthesis entirely.
  function keepAsIs() {
    if (!savedNoteId) {
      onClose();
      return;
    }
    onSaved(buildRow(savedNoteId, []));
    onClose();
  }

  const [linksLoading, setLinksLoading] = useState(false);
  async function fetchLinks(noteId: string) {
    setLinksLoading(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", documentId, noteId }),
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      setSuggestions([]);
    } finally {
      setLinksLoading(false);
    }
  }

  async function confirmLink(s: LinkSuggestion) {
    if (!savedNoteId) return;
    const key = `${s.targetId}:${s.relation}`;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_link",
          documentId,
          sourceNoteId: savedNoteId,
          targetNoteId: s.targetId,
          relation: s.relation,
          rationale: s.rationale || undefined,
        }),
      });
      if (res.ok) setConfirmed((prev) => new Set(prev).add(key));
    } catch {
      // Non-blocking; the note already exists.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-surface-inverse/40 px-4 py-10 backdrop-blur-sm">
      <div className="ob-glass w-full max-w-2xl rounded-card border border-border-strong p-6 shadow-float animate-scale-in sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            <PenLine className="h-3.5 w-3.5" /> Note Forge
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-pill text-content-tertiary hover:bg-surface-sunken hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* read-only source quote */}
        {quote && (
          <div className="mt-4 rounded-lg border-l-2 border-l-accent bg-surface-sunken/60 p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
              <Quote className="h-3 w-3" /> Source
            </div>
            <p className="text-callout leading-relaxed text-content-secondary">{quote}</p>
          </div>
        )}

        {/* WRITE & SYNTHESIZE share the body — text stays visible/editable while streaming */}
        {(phase === "write" || phase === "synthesizing") && (
          <>
            <div className="mt-5 rounded-lg bg-accent-subtle/50 p-4 ring-1 ring-accent-ring/40">
              <div className="mb-1 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                In your own words
              </div>
              {promptLoading ? (
                <div className="flex items-center gap-2 text-body text-content-tertiary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Finding the right question&hellip;
                </div>
              ) : (
                <p className="text-body-lg text-content-primary">{prompt}</p>
              )}
            </div>

            <div className="relative mt-4">
              {/* slim lime hairline during synthesis — never a blocking spinner */}
              {phase === "synthesizing" && (
                <div className="absolute -top-px left-0 right-0 h-0.5 animate-pulse rounded-full bg-accent" />
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                disabled={phase === "synthesizing"}
                placeholder="Explain it yourself — don't look back at the source. Claude will only tighten your words, never replace them."
                className="w-full resize-none rounded-lg border border-border-strong bg-surface p-4 text-body leading-relaxed text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring disabled:opacity-80"
              />
            </div>

            {phase === "synthesizing" && streamText && (
              <div className="mt-3 rounded-lg border border-border bg-surface-sunken/60 p-3.5">
                <div className="mb-1 flex items-center gap-1.5 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                  <Sparkles className="h-3 w-3" /> Organizing your words
                </div>
                <p className="ob-caret whitespace-pre-wrap text-callout leading-relaxed text-content-secondary">
                  {streamText}
                </p>
              </div>
            )}

            {/* I'm stuck → Socratic hint (never the answer) */}
            {phase === "write" && (
              <div className="mt-3">
                {hint ? (
                  <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-subtle p-3 text-callout text-content-primary">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                    <span>{hint}</span>
                  </div>
                ) : (
                  <button
                    onClick={getHint}
                    disabled={hintLoading || promptLoading}
                    className="inline-flex items-center gap-1.5 text-callout text-content-tertiary hover:text-content-secondary disabled:opacity-50"
                  >
                    {hintLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Lightbulb className="h-3.5 w-3.5" />
                    )}
                    I&rsquo;m stuck — nudge me
                  </button>
                )}
              </div>
            )}

            {error && phase === "write" && (
              <p className="mt-3 flex items-center gap-2 text-callout text-danger">
                <AlertTriangle className="h-4 w-4" /> {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={synthesize}
                disabled={phase === "synthesizing" || !draft.trim()}
              >
                {phase === "synthesizing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Organizing&hellip;
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Refine my note
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* REVIEW — accept the refinement (or keep your own words on failure) */}
        {phase === "review" && (
          <div className="mt-5 animate-fade-in">
            {synthFailed ? (
              <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4">
                <div className="flex items-center gap-2 text-callout font-medium text-content-primary">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Your note is saved
                </div>
                <p className="mt-1 text-callout text-content-secondary">
                  Claude couldn&rsquo;t refine it just now, but your writing is safe. Try again or keep
                  it as-is.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={synthesize}>
                    <RotateCcw className="h-4 w-4" /> Retry refine
                  </Button>
                  <Button size="sm" onClick={keepAsIs}>
                    Keep my words
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="mb-1 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                    Title
                  </div>
                  <input
                    value={draftTitle ?? ""}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="Untitled note"
                    className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-headline font-display text-content-primary outline-none focus:border-focus-ring"
                  />
                </div>

                {/* your words vs. tightened — proof of authorship */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-surface-sunken/60 p-3.5">
                    <div className="mb-1 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                      Your words
                    </div>
                    <p className="whitespace-pre-wrap text-callout leading-relaxed text-content-secondary">
                      {draft.trim()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-accent-ring/50 bg-accent-subtle/30 p-3.5">
                    <div className="mb-1 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                      Tightened
                    </div>
                    <p className="whitespace-pre-wrap text-callout leading-relaxed text-content-primary">
                      {draftSynth ?? draft.trim()}
                    </p>
                  </div>
                </div>

                {/* flagged claims surfaced as questions */}
                {flags.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {flags.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle p-2.5 text-callout text-content-primary"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        {f}
                      </div>
                    ))}
                  </div>
                )}

                {/* atomic key-points */}
                {draftKeypoints.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                      Key-points
                    </div>
                    <ul className="space-y-1.5">
                      {draftKeypoints.map((k, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-callout text-content-primary"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {error && (
                  <p className="mt-3 flex items-center gap-2 text-callout text-danger">
                    <AlertTriangle className="h-4 w-4" /> {error}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={keepAsIs}>
                    Keep my words only
                  </Button>
                  <Button variant="accent" onClick={accept} disabled={accepting}>
                    {accepting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving&hellip;
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Accept &amp; save
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* CONNECT — confirm suggested links */}
        {phase === "linking" && (
          <div className="mt-5 animate-fade-in">
            <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              <Link2 className="h-3.5 w-3.5" /> Connect to your other notes
            </div>
            <p className="mt-1 text-callout text-content-secondary">
              Confirming a link is itself a recall act — only keep the ones that are true.
            </p>

            {linksLoading ? (
              <div className="mt-4 flex items-center gap-2 text-callout text-content-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking for connections&hellip;
              </div>
            ) : suggestions.length === 0 ? (
              <p className="mt-4 text-callout text-content-tertiary">
                No strong connections yet. They&rsquo;ll appear as your notebook grows.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {suggestions.map((s) => {
                  const key = `${s.targetId}:${s.relation}`;
                  const done = confirmed.has(key);
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-callout text-content-primary">
                          <span className="text-content-tertiary">{RELATION_LABEL[s.relation]}</span>
                          <span className="font-medium">{s.targetTitle}</span>
                        </div>
                        {s.rationale && (
                          <p className="mt-0.5 text-caption text-content-tertiary">{s.rationale}</p>
                        )}
                      </div>
                      {done ? (
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-subtle px-2.5 py-1 text-caption-sm font-semibold text-success">
                          <Check className="h-3.5 w-3.5" /> Linked
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => confirmLink(s)}>
                          <Link2 className="h-4 w-4" /> Confirm
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================ QUICK RECALL
type RecallResult = {
  feedback: string;
  score: number;
  covered: { index: number; text: string }[];
  missed: { index: number; text: string }[];
};

function QuickRecall({
  note,
  onClose,
  onGraded,
}: {
  note: NoteRow;
  onClose: () => void;
  onGraded: (nextDueAt: string | null) => void;
}) {
  const [response, setResponse] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<RecallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grade() {
    const body = response.trim();
    if (!body || grading) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade", noteId: note.id, response: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not grade.");
      setResult({
        feedback: data.feedback ?? "",
        score: typeof data.score === "number" ? data.score : 0,
        covered: Array.isArray(data.covered) ? data.covered : [],
        missed: Array.isArray(data.missed) ? data.missed : [],
      });
      onGraded(typeof data.nextReviewAt === "string" ? data.nextReviewAt : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grade.");
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-surface-inverse/40 px-4 py-10 backdrop-blur-sm">
      <div className="ob-glass w-full max-w-xl rounded-card border border-border-strong p-6 shadow-float animate-scale-in sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            <Brain className="h-3.5 w-3.5" /> Quick Recall
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-pill text-content-tertiary hover:bg-surface-sunken hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-4 font-display text-title-2 text-content-primary">
          {note.title ?? "Untitled note"}
        </h2>
        {note.retrievalPrompt && (
          <p className="mt-2 text-body-lg text-content-secondary">{note.retrievalPrompt}</p>
        )}

        {!result ? (
          <>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Re-explain it from memory — the note body is hidden on purpose."
              className="mt-4 w-full resize-none rounded-lg border border-border-strong bg-surface p-4 text-body leading-relaxed text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
            />
            {error && (
              <p className="mt-3 flex items-center gap-2 text-callout text-danger">
                <AlertTriangle className="h-4 w-4" /> {error}
              </p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="accent" onClick={grade} disabled={grading || !response.trim()}>
                {grading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking&hellip;
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Check my recall
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-4 animate-fade-in">
            <p className="text-body text-content-primary">{result.feedback}</p>

            {result.covered.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-caption-sm uppercase tracking-[0.1em] text-success">
                  <Check className="h-3.5 w-3.5" /> Covered
                </div>
                <ul className="space-y-1.5">
                  {result.covered.map((k) => (
                    <li
                      key={k.index}
                      className="flex items-start gap-2 text-callout text-content-primary"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {k.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.missed.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-caption-sm uppercase tracking-[0.1em] text-warning">
                  <RotateCcw className="h-3.5 w-3.5" /> Missed
                </div>
                <ul className="space-y-1.5">
                  {result.missed.map((k) => (
                    <li
                      key={k.index}
                      className="flex items-start gap-2 text-callout text-content-secondary"
                    >
                      <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      {k.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
