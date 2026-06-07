"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Sparkles, RotateCcw, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- types ----------
type Card = {
  word: string;
  lemma: string;
  pos: string;
  contextualDefinition: string;
  plainGloss: string | null;
  senseTag: string | null;
  whyHere: string | null;
  distractors: string[];
  difficulty: string;
};

type Anchor = {
  // Where to pin the popover (under the hovered word).
  x: number; // viewport center-x of the word
  bottom: number; // viewport y of the word's bottom edge
  word: string;
  sentence: string;
  charStart: number;
  charEnd: number;
  chunkId: string | null;
};

type Phase = "loading" | "predict" | "confirm" | "error";

const DWELL_MS = 350;
const LINGER_MS = 600;

// A "content word" worth defining — skip tiny function words and pure numbers.
const STOPISH = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "and", "or", "but",
  "is", "are", "was", "were", "be", "as", "it", "its", "this", "that", "these",
  "those", "with", "from", "into", "you", "your", "i", "we", "they", "he", "she",
]);

const isWordChar = (ch: string) => /[0-9a-zà-öø-ÿ'-]/i.test(ch);

/** Expand a (textNode, offset) hit to the word boundaries around it. */
function wordAt(text: string, offset: number): { word: string; start: number; end: number } | null {
  if (offset < 0 || offset > text.length) return null;
  let start = offset;
  let end = offset;
  // If we landed just past the word, step back one.
  if (start > 0 && (start >= text.length || !isWordChar(text[start])) && isWordChar(text[start - 1])) {
    start -= 1;
    end -= 1;
  }
  if (end >= text.length || !isWordChar(text[end])) return null;
  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;
  const word = text.slice(start, end);
  return word.length >= 2 ? { word, start, end } : null;
}

/** Resolve the caret (textNode + offset) under viewport coords across browsers. */
function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
    return null;
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

/** Walk up to find the sentence this word sits in (so senses disambiguate). */
function sentenceAround(text: string, start: number, end: number): { sentence: string; offsetInSentence: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const sStart = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
    before.lastIndexOf("\n")
  );
  const from = sStart === -1 ? 0 : sStart + 2;
  const afterMatch = after.search(/[.!?](\s|$)/);
  const to = afterMatch === -1 ? text.length : end + afterMatch + 1;
  const sentence = text.slice(from, to).trim();
  const leadTrim = text.slice(from, start).length - text.slice(from, start).trimStart().length;
  return { sentence, offsetInSentence: start - from - leadTrim };
}

export function DictionaryHover({
  documentId,
  children,
}: {
  documentId: string;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWordKey = useRef<string | null>(null);
  const reqId = useRef(0);

  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [chips, setChips] = useState<{ text: string; correct: boolean }[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => setMounted(true), []);

  const reducedMotion = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const update = () => {
      reducedMotion.current =
        mq.matches || root.dataset.reducedMotion === "on" || root.dataset.focus === "on";
    };
    update();
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["data-reduced-motion", "data-focus"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);

  const clearLinger = () => {
    if (lingerTimer.current) {
      clearTimeout(lingerTimer.current);
      lingerTimer.current = null;
    }
  };

  const close = useCallback(() => {
    reqId.current += 1; // invalidate any in-flight fetch
    lastWordKey.current = null;
    setAnchor(null);
    setCard(null);
    setLookupId(null);
    setChips([]);
    setPicked(null);
    setRevealed(false);
    setPulse(false);
  }, []);

  // Fetch the card and build the predict-step chips once it resolves.
  const lookup = useCallback(
    async (a: Anchor) => {
      const myReq = ++reqId.current;
      setPhase("loading");
      setCard(null);
      setLookupId(null);
      setChips([]);
      setPicked(null);
      setRevealed(false);
      setPulse(false);
      try {
        const res = await fetch("/api/dictionary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "lookup",
            documentId,
            chunkId: a.chunkId,
            word: a.word,
            sentence: a.sentence,
            charStart: a.charStart,
            charEnd: a.charEnd,
          }),
        });
        if (myReq !== reqId.current) return; // a newer hover superseded this
        const data = await res.json();
        if (!res.ok || !data?.card) throw new Error(data?.error || "unavailable");
        if (myReq !== reqId.current) return;
        const c = data.card as Card;
        setCard(c);
        setLookupId(data.lookupId ?? null);
        // The correct gloss + 2 distractors, shuffled — same call, no latency.
        const correctChip = { text: c.plainGloss || c.contextualDefinition, correct: true };
        const wrong = c.distractors.map((d) => ({ text: d, correct: false }));
        setChips(shuffle([correctChip, ...wrong]));
        setPhase("predict");
      } catch {
        if (myReq !== reqId.current) return;
        setPhase("error");
      }
    },
    [documentId]
  );

  // Throttled caret probing: on dwell, anchor the popover under the word.
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Never fight inputs, textareas, or an active text selection (highlighter).
      const target = e.target as HTMLElement | null;
      if (target && target.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) return;
      if (target && target.closest("[data-dict-popover]")) return; // hovering the card itself
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;

      const px = e.clientX;
      const py = e.clientY;

      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      dwellTimer.current = setTimeout(() => {
        const hit = caretFromPoint(px, py);
        if (!hit || hit.node.nodeType !== Node.TEXT_NODE) return;
        const textNode = hit.node as Text;
        const full = textNode.textContent ?? "";
        const w = wordAt(full, hit.offset);
        if (!w) return;
        if (STOPISH.has(w.word.toLowerCase()) || /^\d+$/.test(w.word)) return;

        // Skip if we're still on the same word as the open card.
        const parentEl = textNode.parentElement;
        const key = `${(parentEl && elementPath(parentEl)) ?? ""}:${w.start}:${w.word}`;
        if (key === lastWordKey.current) {
          clearLinger();
          return;
        }
        lastWordKey.current = key;

        // Geometry: a Range over the word gives us the precise rect to anchor to.
        const range = document.createRange();
        try {
          range.setStart(textNode, w.start);
          range.setEnd(textNode, w.end);
        } catch {
          return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const chunkEl = parentEl?.closest("[data-chunk-id]") as HTMLElement | null;
        const chunkText = chunkEl?.textContent ?? full;
        // Find the word within the broader chunk text to extract a real sentence.
        const localIndex = (chunkEl ? chunkText.indexOf(w.word) : w.start);
        const baseIndex = chunkEl
          ? approxIndexInChunk(chunkText, full, w.start, w.word, localIndex)
          : w.start;
        const { sentence, offsetInSentence } = sentenceAround(
          chunkText,
          baseIndex,
          baseIndex + w.word.length
        );

        clearLinger();
        setAnchor({
          x: rect.left + rect.width / 2,
          bottom: rect.bottom,
          word: w.word,
          sentence: sentence || full.trim(),
          charStart: Math.max(0, offsetInSentence),
          charEnd: Math.max(0, offsetInSentence) + w.word.length,
          chunkId: chunkEl?.getAttribute("data-chunk-id") ?? null,
        });
      }, DWELL_MS);
    },
    []
  );

  // Kick off the fetch whenever a new word is anchored.
  useEffect(() => {
    if (anchor) lookup(anchor);
  }, [anchor, lookup]);

  // Leaving the wrapper → linger, then fade (or cut instantly under reduced motion).
  const onPointerLeave = useCallback(() => {
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    if (reducedMotion.current) {
      close();
      return;
    }
    clearLinger();
    lingerTimer.current = setTimeout(close, LINGER_MS);
  }, [close]);

  const onPopoverEnter = () => clearLinger();
  const onPopoverLeave = () => {
    if (reducedMotion.current) {
      close();
      return;
    }
    clearLinger();
    lingerTimer.current = setTimeout(close, LINGER_MS);
  };

  // PREDICT → CONFIRM. Logs the guess; correct = one lime pulse.
  async function choose(text: string, correct: boolean) {
    if (picked !== null) return;
    setPicked(text);
    if (correct && !reducedMotion.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }
    setPhase("confirm");
    if (lookupId) {
      fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "guess", lookupId, correct }),
      }).catch(() => {});
    }
  }

  function reveal() {
    setRevealed(true);
    setPhase("confirm");
    if (lookupId) {
      fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "guess", lookupId, correct: false }),
      }).catch(() => {});
    }
  }

  useEffect(() => {
    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}

      {mounted && anchor &&
        createPortal(
          <Popover
            anchor={anchor}
            phase={phase}
            card={card}
            chips={chips}
            picked={picked}
            revealed={revealed}
            pulse={pulse}
            onEnter={onPopoverEnter}
            onLeave={onPopoverLeave}
            onChoose={choose}
            onReveal={reveal}
            onRetry={() => lookup(anchor)}
            onClose={close}
          />,
          document.body
        )}
    </div>
  );
}

// ----------------------------------------------------------------- Popover
function Popover({
  anchor,
  phase,
  card,
  chips,
  picked,
  revealed,
  pulse,
  onEnter,
  onLeave,
  onChoose,
  onReveal,
  onRetry,
  onClose,
}: {
  anchor: Anchor;
  phase: Phase;
  card: Card | null;
  chips: { text: string; correct: boolean }[];
  picked: string | null;
  revealed: boolean;
  pulse: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onChoose: (text: string, correct: boolean) => void;
  onReveal: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const WIDTH = 288;
  // Clamp horizontally to the viewport; pin just under the word.
  const left = Math.min(
    Math.max(12, anchor.x - WIDTH / 2),
    (typeof window !== "undefined" ? window.innerWidth : WIDTH) - WIDTH - 12
  );
  const top = anchor.bottom + 8;

  const headword = card?.word ?? anchor.word;
  const guessedRight = picked != null && chips.find((c) => c.text === picked)?.correct === true;

  return (
    <div
      ref={ref}
      data-dict-popover
      role="dialog"
      aria-label={`Definition of ${headword}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      style={{ position: "fixed", left, top, width: WIDTH, zIndex: 60 }}
      className={cn(
        "ob-glass rounded-card p-4 shadow-float animate-scale-in",
        pulse && "ring-2 ring-accent animate-pop-spring"
      )}
    >
      {/* Header: headword + POS pill */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-title-3 leading-tight text-content-primary">{headword}</h3>
        {card?.pos ? (
          <span className="shrink-0 rounded-pill bg-surface-sunken px-2 py-0.5 text-caption-sm font-medium lowercase text-content-secondary">
            {card.pos}
          </span>
        ) : (
          <Skeleton className="h-5 w-12 rounded-pill" />
        )}
      </div>

      {/* PREDICT — chips appear the moment the (same) call resolves */}
      {phase === "loading" && (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="flex items-center gap-1.5 text-caption-sm text-content-tertiary">
            <BookOpen className="h-3.5 w-3.5" /> Reading the sentence…
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
          <Skeleton className="h-8 w-4/6" />
        </div>
      )}

      {phase === "predict" && card && (
        <div className="mt-3 animate-fade-in">
          <div className="mb-2 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
            What does it mean here?
          </div>
          <div className="flex flex-col gap-1.5">
            {chips.map((chip, i) => (
              <button
                key={i}
                onClick={() => onChoose(chip.text, chip.correct)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-left text-callout text-content-primary transition-colors hover:border-border-strong hover:bg-surface-sunken"
              >
                {chip.text}
              </button>
            ))}
          </div>
          <button
            onClick={onReveal}
            className="mt-2 text-caption-sm text-content-tertiary underline-offset-2 hover:text-content-secondary hover:underline"
          >
            Just show me
          </button>
        </div>
      )}

      {/* CONFIRM — contextual definition + plain gloss + why-here */}
      {phase === "confirm" && card && (
        <div className="mt-3 animate-fade-in">
          {picked != null && (
            <div
              className={cn(
                "mb-2 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption-sm font-medium",
                guessedRight
                  ? "bg-accent-subtle text-content-primary ring-1 ring-accent-ring/60"
                  : "bg-warning-subtle text-warning"
              )}
            >
              {guessedRight ? (
                <>
                  <Check className="h-3.5 w-3.5" /> You got it
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" /> Here it&rsquo;s a different sense
                </>
              )}
            </div>
          )}

          <p className="text-body leading-relaxed text-content-primary">
            {card.contextualDefinition}
          </p>

          {card.plainGloss && card.plainGloss !== card.contextualDefinition && (
            <p className="mt-1.5 text-callout leading-relaxed text-content-tertiary">
              {card.plainGloss}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {card.senseTag && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-caption-sm text-content-secondary">
                <Quote className="h-3 w-3" />
                {card.senseTag}
              </span>
            )}
            {card.whyHere && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-subtle px-2.5 py-1 text-caption-sm text-content-primary ring-1 ring-accent-ring/40">
                <Sparkles className="h-3 w-3" />
                {card.whyHere}
              </span>
            )}
          </div>

          {revealed && (
            <p className="mt-2 text-caption-sm text-content-tertiary">Added to your vocab list.</p>
          )}
        </div>
      )}

      {/* ERROR — graceful retry, never a dead end */}
      {phase === "error" && (
        <div className="mt-3 animate-fade-in">
          <p className="text-callout text-content-secondary">
            In-context sense unavailable.
          </p>
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-caption-sm font-medium text-content-primary hover:bg-surface-sunken"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Tap to retry
          </button>
          <button
            onClick={onClose}
            className="ml-2 text-caption-sm text-content-tertiary hover:text-content-secondary"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A cheap stable-ish path for de-duping repeated hovers over the same word. */
function elementPath(el: Element): string {
  const id = el.closest("[data-chunk-id]")?.getAttribute("data-chunk-id");
  return id ?? el.tagName;
}

/**
 * Map a word offset inside one text node to its index within the chunk's full
 * text, so the extracted sentence covers cross-node prose. Falls back to a
 * direct search when the node-local slice can't be located.
 */
function approxIndexInChunk(
  chunkText: string,
  nodeText: string,
  startInNode: number,
  word: string,
  fallback: number
): number {
  const nodeStart = chunkText.indexOf(nodeText);
  if (nodeStart >= 0) return nodeStart + startInNode;
  const direct = chunkText.indexOf(word);
  return direct >= 0 ? direct : Math.max(0, fallback);
}
