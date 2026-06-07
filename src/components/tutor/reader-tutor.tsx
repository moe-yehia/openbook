"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Quote, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type Citation = { n: number; locLabel: string; content: string };

const EXAMPLES = [
  "Give me the big picture in two sentences.",
  "Explain the hardest part more simply.",
  "Quiz me on what I just read.",
];

function renderWithCitations(
  text: string,
  onCite: (n: number) => void,
  openN: number | null
): React.ReactNode {
  // Split on [n] tokens and render those as clickable pills.
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const n = parseInt(m[1], 10);
      return (
        <button
          key={i}
          onClick={() => onCite(n)}
          className={cn(
            "mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 align-baseline text-caption-sm font-semibold text-content-primary ring-1 ring-accent-ring/50 transition-colors hover:bg-accent",
            openN === n ? "bg-accent" : "bg-accent-subtle"
          )}
          aria-label={`Show source ${n}`}
        >
          {n}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function ReaderTutor({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  // Which citation is revealed, keyed by message index → citation number.
  const [open, setOpen] = useState<{ msg: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

  async function send(question: string) {
    const q = question.trim();
    if (!q || streaming) return;
    setError(null);
    setOpen(null);
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, messages: next }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "The tutor is unavailable.");

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
          let ev: { type: string; items?: Citation[]; text?: string; message?: string };
          try {
            ev = JSON.parse(raw);
          } catch {
            continue;
          }
          if (ev.type === "citations" && ev.items) setCitations(ev.items);
          else if (ev.type === "delta" && ev.text) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + ev.text };
              return copy;
            });
            scrollDown();
          } else if (ev.type === "error") throw new Error(ev.message ?? "Tutor error.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((prev) =>
        prev.filter((m, i) => !(i === prev.length - 1 && m.role === "assistant" && !m.content))
      );
    } finally {
      setStreaming(false);
    }
  }

  function toggleCite(msg: number, n: number) {
    setOpen((cur) => (cur && cur.msg === msg && cur.n === n ? null : { msg, n }));
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col rounded-card border border-border bg-surface">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-pill bg-accent-subtle">
            <Sparkles className="h-3.5 w-3.5 text-content-primary" />
          </span>
          <span className="text-callout font-semibold text-content-primary">Study companion</span>
        </div>
        <Link
          href={`/documents/${documentId}/tutor`}
          className="shrink-0 text-caption font-medium text-content-secondary transition-colors hover:text-content-primary"
        >
          Open full tutor →
        </Link>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="pt-1">
            <p className="text-body font-medium text-content-primary">
              Ask anything about this page.
            </p>
            <p className="mt-1 text-caption text-content-secondary">
              I&rsquo;ll cite the exact passage it came from.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-left text-caption text-content-primary transition-colors hover:border-border-strong hover:bg-surface-sunken"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4" aria-live="polite">
            {messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[88%] rounded-2xl rounded-br-md bg-surface-sunken px-3 py-2 text-callout text-content-primary">
                      {m.content}
                    </div>
                  </div>
                );
              }
              const openHere = open && open.msg === i ? open.n : null;
              const cite = openHere != null ? citations.find((c) => c.n === openHere) ?? null : null;
              return (
                <div key={i}>
                  <div
                    className={cn(
                      "text-callout leading-relaxed text-content-primary",
                      streaming && i === messages.length - 1 && "ob-caret"
                    )}
                  >
                    {renderWithCitations(m.content, (n) => toggleCite(i, n), openHere)}
                  </div>
                  {cite && (
                    <div className="mt-2 rounded-lg border border-accent-ring/50 bg-accent-subtle/40 p-3 animate-scale-in">
                      <div className="mb-1.5 flex items-center gap-1.5 text-caption-sm font-semibold text-content-secondary">
                        <Quote className="h-3 w-3" />[{cite.n}] · {cite.locLabel}
                      </div>
                      <p className="text-caption leading-relaxed text-content-primary">
                        {cite.content}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5 text-caption text-content-primary">
            {error}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-border p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-1.5 rounded-2xl border border-border-strong bg-surface p-1.5 focus-within:border-focus-ring"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            disabled={streaming}
            placeholder="Ask your tutor…"
            className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1 text-callout text-content-primary outline-none placeholder:text-content-tertiary disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="Send"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-cta text-cta-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
