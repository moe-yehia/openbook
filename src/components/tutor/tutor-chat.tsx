"use client";

import { Fragment, useRef, useState } from "react";
import { ArrowUp, Quote, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnderstandingCheck } from "./understanding-check";

type Msg = { role: "user" | "assistant"; content: string };
type Citation = { n: number; locLabel: string; content: string };

function renderWithCitations(
  text: string,
  onCite: (n: number) => void
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
          className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-subtle px-1.5 align-baseline text-caption-sm font-semibold text-content-primary ring-1 ring-accent-ring/50 hover:bg-accent"
          aria-label={`Show source ${n}`}
        >
          {n}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function TutorChat({
  documentId,
  starterQuestions,
  concepts,
}: {
  documentId: string;
  starterQuestions: string[];
  concepts: { id: string; label: string }[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [active, setActive] = useState<Citation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

  async function send(question: string) {
    const q = question.trim();
    if (!q || streaming) return;
    setError(null);
    setActive(null);
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
      setMessages((prev) => prev.filter((m, i) => !(i === prev.length - 1 && m.role === "assistant" && !m.content)));
    } finally {
      setStreaming(false);
    }
  }

  const empty = messages.length === 0;
  const lastMsg = messages[messages.length - 1];
  const prevMsg = messages.length >= 2 ? messages[messages.length - 2] : null;
  const showCheck =
    !streaming &&
    lastMsg?.role === "assistant" &&
    lastMsg.content.trim().length > 0 &&
    prevMsg?.role === "user";

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[200px_1fr_320px]">
      {/* LEFT — concept rail */}
      <aside className="hidden flex-col border-r border-border p-4 lg:flex">
        <div className="mb-3 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          Concepts
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {concepts.length === 0 && (
            <span className="text-caption text-content-tertiary">Mapping as you study…</span>
          )}
          {concepts.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setInput(`Explain "${c.label}" from this material.`);
                inputRef.current?.focus();
              }}
              className="rounded-md px-2.5 py-1.5 text-left text-callout text-content-secondary hover:bg-surface-sunken hover:text-content-primary"
            >
              {c.label}
            </button>
          ))}
        </div>
      </aside>

      {/* CENTER — editorial conversation */}
      <section className="flex min-h-0 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-2xl">
            {empty ? (
              <div className="pt-6">
                <span className="grid h-11 w-11 place-items-center rounded-pill bg-accent-subtle">
                  <Sparkles className="h-5 w-5 text-content-primary" />
                </span>
                <h1 className="mt-4 font-display text-title-1 text-content-primary">
                  Let&rsquo;s work through this together.
                </h1>
                <p className="mt-2 text-body-lg text-content-secondary">
                  Ask anything. I&rsquo;ll show you where the answer lives in your material — and check
                  that it actually stuck.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  {starterQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-lg border border-border bg-surface px-4 py-3 text-left text-body text-content-primary transition-colors hover:border-border-strong hover:bg-surface-sunken"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7" aria-live="polite">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-sunken px-4 py-2.5 text-body text-content-primary">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={cn(
                        "text-body-lg leading-relaxed text-content-primary",
                        streaming && i === messages.length - 1 && "ob-caret"
                      )}
                    >
                      {renderWithCitations(m.content, (n) =>
                        setActive(citations.find((c) => c.n === n) ?? null)
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {showCheck && prevMsg && lastMsg && (
              <UnderstandingCheck
                key={messages.length}
                documentId={documentId}
                question={prevMsg.content}
                answer={lastMsg.content}
              />
            )}

            {error && (
              <div className="mt-6 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-border bg-background/80 px-6 py-4 backdrop-blur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-border-strong bg-surface p-2 focus-within:border-focus-ring"
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
              placeholder="Ask your tutor anything…"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-body text-content-primary outline-none placeholder:text-content-tertiary"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-cta text-cta-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>

      {/* RIGHT — source rail */}
      <aside className="hidden border-l border-border p-5 lg:block">
        <div className="mb-3 flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          <Quote className="h-3.5 w-3.5" /> Source
        </div>
        {active ? (
          <div className="rounded-lg border border-accent-ring/50 bg-accent-subtle/40 p-4">
            <div className="mb-2 text-caption-sm font-semibold text-content-secondary">
              [{active.n}] · {active.locLabel}
            </div>
            <p className="text-callout leading-relaxed text-content-primary">{active.content}</p>
          </div>
        ) : (
          <p className="text-caption text-content-tertiary">
            Tap a citation like{" "}
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-subtle px-1 text-caption-sm ring-1 ring-accent-ring/50">
              1
            </span>{" "}
            in an answer to see the exact passage it came from.
          </p>
        )}
      </aside>
    </div>
  );
}
