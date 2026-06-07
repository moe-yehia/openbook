import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CircleDashed, RotateCcw, Sparkles, Target, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { QuizRunner } from "@/components/quiz/quiz-runner";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type AttemptRow = {
  quiz_item_id: string;
  answer: { value?: string } | null;
  confidence: number | null;
  is_correct: boolean | null;
  partial_credit: number | null;
  misconception_label: string | null;
  ai_feedback: string | null;
};

type OptionRow = { id: string; text: string };

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: { docId: string };
  searchParams: { quiz?: string; new?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, emoji")
    .eq("id", params.docId)
    .single();
  if (!doc) notFound();

  const header = (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-5">
      <Link
        href={`/documents/${doc.id}`}
        className="inline-flex items-center gap-1.5 text-callout text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-content-tertiary">{doc.emoji || "📄"}</span>
        {doc.title}
      </Link>
      <span className="ml-auto text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
        Quiz
      </span>
    </div>
  );

  // -------------------------------------------------------------- NEW RUN
  // The hub explicitly opts into a fresh diagnostic; only then is the live
  // runner mounted (its own generate/grade/complete flow takes over).
  if (searchParams.new === "1") {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <QuizRunner documentId={doc.id} docTitle={doc.title} docEmoji={doc.emoji || "📄"} />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------- REVIEW MODE
  const reviewId = searchParams.quiz;
  if (reviewId) {
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, status, score, started_at, completed_at")
      .eq("id", reviewId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!quiz) notFound();

    const { data: itemRows } = await supabase
      .from("quiz_items")
      .select("id, kind, stem, options, correct, explanation, ordinal")
      .eq("quiz_id", quiz.id)
      .eq("owner_id", user.id)
      .order("ordinal", { ascending: true });
    const items = itemRows ?? [];

    const itemIds = items.map((i) => i.id);
    const attemptByItem = new Map<string, AttemptRow>();
    if (itemIds.length > 0) {
      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select(
          "quiz_item_id, answer, confidence, is_correct, partial_credit, misconception_label, ai_feedback"
        )
        .eq("owner_id", user.id)
        .in("quiz_item_id", itemIds)
        .order("created_at", { ascending: true });
      // Keep the latest attempt per item.
      for (const a of (attempts as AttemptRow[]) ?? []) attemptByItem.set(a.quiz_item_id, a);
    }

    const pct = typeof quiz.score === "number" ? Math.round(quiz.score * 100) : null;

    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <div className="mx-auto max-w-2xl px-6 py-10">
            <Link
              href={`/documents/${doc.id}/quiz`}
              className="inline-flex items-center gap-1.5 text-callout text-content-secondary hover:text-content-primary"
            >
              <ArrowLeft className="h-4 w-4" /> All quizzes
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-title-1 text-content-primary">Quiz review</h1>
              {quiz.status === "completed" ? (
                <Pill tone="success" icon={<Check className="h-3.5 w-3.5" />}>
                  Completed
                </Pill>
              ) : (
                <Pill tone="info" icon={<CircleDashed className="h-3.5 w-3.5" />}>
                  In progress
                </Pill>
              )}
            </div>
            <p className="mt-2 text-body-lg text-content-secondary">
              {dateFmt.format(new Date(quiz.completed_at ?? quiz.started_at))}
              {pct !== null ? ` · scored ${pct}%` : ""} across {items.length}{" "}
              {items.length === 1 ? "question" : "questions"}.
            </p>

            <div className="mt-7 space-y-4">
              {items.map((it, idx) => (
                <ReviewCard
                  key={it.id}
                  ordinal={idx + 1}
                  stem={it.stem as string}
                  kind={it.kind as "mcq" | "short_answer"}
                  options={(it.options as OptionRow[] | null) ?? null}
                  correct={it.correct}
                  explanation={(it.explanation as string | null) ?? null}
                  attempt={attemptByItem.get(it.id) ?? null}
                />
              ))}
              {items.length === 0 && (
                <div className="rounded-card border border-dashed border-border p-10 text-center text-body text-content-secondary">
                  This quiz has no saved questions.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ HUB
  const { data: quizRows } = await supabase
    .from("quizzes")
    .select("id, status, score, started_at, completed_at")
    .eq("document_id", doc.id)
    .eq("owner_id", user.id)
    .order("started_at", { ascending: false });
  const quizzes = quizRows ?? [];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {header}
      <div className="min-h-0 flex-1">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <span className="grid h-12 w-12 place-items-center rounded-pill bg-accent-subtle">
            <Target className="h-6 w-6 text-content-primary" />
          </span>
          <h1 className="mt-5 font-display text-title-1 text-content-primary">
            Diagnostics for this source
          </h1>
          <p className="mt-2 text-body-lg text-content-secondary">
            Run an adaptive diagnostic, then come back to any past run — your scores and per-question
            feedback stay here.
          </p>

          <div className="mt-7">
            <Button variant="accent" href={`/documents/${doc.id}/quiz?new=1`}>
              <Sparkles className="h-4 w-4" /> Start new diagnostic
            </Button>
          </div>

          <div className="mt-10">
            <div className="mb-3 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              Past quizzes
            </div>
            {quizzes.length === 0 ? (
              <div className="rounded-card border border-dashed border-border p-10 text-center">
                <p className="text-body text-content-secondary">No quizzes yet.</p>
                <p className="mt-1 text-caption text-content-tertiary">
                  Your first diagnostic will appear here so you never lose it.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {quizzes.map((q) => {
                  const qpct = typeof q.score === "number" ? Math.round(q.score * 100) : null;
                  const done = q.status === "completed";
                  return (
                    <Link
                      key={q.id}
                      href={`/documents/${doc.id}/quiz?quiz=${q.id}`}
                      className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 transition-[transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-e3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-headline text-content-primary">
                          {dateFmt.format(new Date(q.completed_at ?? q.started_at))}
                        </div>
                        <div className="mt-0.5 text-caption text-content-tertiary">
                          {qpct !== null ? `Scored ${qpct}%` : "Not yet scored"}
                        </div>
                      </div>
                      {done ? (
                        <Pill tone="success" icon={<Check className="h-3.5 w-3.5" />}>
                          Completed
                        </Pill>
                      ) : (
                        <Pill tone="info" icon={<CircleDashed className="h-3.5 w-3.5" />}>
                          Active
                        </Pill>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================================================================== REVIEW CARD
function ReviewCard({
  ordinal,
  stem,
  kind,
  options,
  correct,
  explanation,
  attempt,
}: {
  ordinal: number;
  stem: string;
  kind: "mcq" | "short_answer";
  options: OptionRow[] | null;
  correct: unknown;
  explanation: string | null;
  attempt: AttemptRow | null;
}) {
  const chosen = attempt?.answer?.value ?? null;
  const isCorrect = attempt?.is_correct === true;
  const partial = !isCorrect && (attempt?.partial_credit ?? 0) >= 0.5;
  const correctId = typeof correct === "string" ? correct : correct == null ? "" : String(correct);

  const verdict = !attempt
    ? { tone: "neutral" as const, Icon: CircleDashed, label: "Not answered" }
    : isCorrect
      ? { tone: "success" as const, Icon: Check, label: "Got it" }
      : partial
        ? { tone: "warning" as const, Icon: CircleDashed, label: "Almost" }
        : { tone: "danger" as const, Icon: RotateCcw, label: "Missed" };
  const VIcon = verdict.Icon;

  return (
    <div className="rounded-card border border-border bg-surface p-6 shadow-e1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          Question {ordinal}
        </span>
        <Pill tone={verdict.tone} icon={<VIcon className="h-3.5 w-3.5" />}>
          {verdict.label}
        </Pill>
      </div>
      <p className="text-title-3 font-display text-content-primary">{stem}</p>

      {kind === "mcq" && options ? (
        <div className="mt-4 space-y-2">
          {options.map((o) => {
            const isChosen = chosen === o.id;
            const isAnswer = o.id === correctId;
            return (
              <div
                key={o.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-body",
                  isAnswer
                    ? "border-success/40 bg-success-subtle text-content-primary"
                    : isChosen
                      ? "border-danger/40 bg-danger-subtle text-content-primary"
                      : "border-border text-content-secondary"
                )}
              >
                {isAnswer ? (
                  <Check className="h-4 w-4 shrink-0 text-success" />
                ) : isChosen ? (
                  <X className="h-4 w-4 shrink-0 text-danger" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1">{o.text}</span>
                {isChosen && (
                  <span className="text-caption-sm uppercase tracking-[0.05em] text-content-tertiary">
                    Your answer
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-border bg-surface-sunken p-3.5">
            <div className="mb-1 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
              Your answer
            </div>
            <p className="text-body text-content-primary">
              {chosen && chosen.trim() ? chosen : "—"}
            </p>
          </div>
          <div className="rounded-md border border-success/30 bg-success-subtle p-3.5">
            <div className="mb-1 text-caption-sm uppercase tracking-[0.1em] text-content-secondary">
              Ideal answer
            </div>
            <p className="text-body text-content-primary">{correctId || "—"}</p>
          </div>
        </div>
      )}

      {attempt?.ai_feedback && (
        <p className="mt-4 text-body text-content-primary">{attempt.ai_feedback}</p>
      )}
      {explanation && (
        <p className="mt-3 rounded-md bg-surface-sunken p-3.5 text-body text-content-secondary">
          {explanation}
        </p>
      )}
      {attempt?.misconception_label && (
        <div className="mt-3">
          <Pill tone="warning" icon={<CircleDashed className="h-3.5 w-3.5" />}>
            {attempt.misconception_label}
          </Pill>
        </div>
      )}
    </div>
  );
}
