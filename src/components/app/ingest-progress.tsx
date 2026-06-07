"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "parsing", label: "Reading the source" },
  { key: "chunking", label: "Organizing the content" },
  { key: "embedding", label: "Mapping concepts" },
  { key: "ready", label: "Ready" },
];

/**
 * Streams ingestion progress for a document. Subscribes to Supabase Realtime
 * and polls as a reliable fallback; refreshes the server component when done.
 */
export function IngestProgress({
  docId,
  initialStatus,
}: {
  docId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let done = false;

    const apply = (s: string, err?: string | null) => {
      setStatus(s);
      if (err) setError(err);
      if ((s === "ready" || s === "failed") && !done) {
        done = true;
        setTimeout(() => router.refresh(), 350);
      }
    };

    const channel = supabase
      .channel(`doc-${docId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "documents", filter: `id=eq.${docId}` },
        (payload) => apply((payload.new as { status: string }).status, (payload.new as { error?: string }).error)
      )
      .subscribe();

    // Poll fallback (works even if Realtime isn't enabled on the table).
    const poll = setInterval(async () => {
      const { data } = await supabase.from("documents").select("status, error").eq("id", docId).single();
      if (data) apply(data.status, data.error);
      if (done) clearInterval(poll);
    }, 1600);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [docId, router]);

  const currentIdx = STAGES.findIndex((s) => s.key === status);
  const failed = status === "failed";

  return (
    <div className="rounded-card border border-border bg-surface p-7">
      {failed ? (
        <div>
          <h3 className="font-display text-title-3 text-content-primary">We hit a snag</h3>
          <p className="mt-2 text-body text-content-secondary">
            {error ?? "This source couldn't be processed."}
          </p>
        </div>
      ) : (
        <>
          <h3 className="font-display text-title-3 text-content-primary">Setting up your study space…</h3>
          <ol className="mt-5 space-y-3">
            {STAGES.slice(0, 4).map((stage, i) => {
              const reached = currentIdx >= i || status === "ready";
              const active = currentIdx === i && status !== "ready";
              return (
                <li key={stage.key} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full border",
                      reached && !active && "border-accent-ring bg-accent text-accent-foreground",
                      active && "border-accent-ring bg-accent-subtle text-content-primary",
                      !reached && "border-border text-content-tertiary"
                    )}
                  >
                    {reached && !active ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className={cn("text-body", reached ? "text-content-primary" : "text-content-tertiary")}>
                    {stage.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
