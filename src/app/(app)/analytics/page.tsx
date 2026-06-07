import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BookOpen, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  prereqFanout,
  rankConcepts,
  fallbackRationale,
  hoursUntilThreshold,
  estimateMinutes,
  masteryTone,
  type MasteryRow,
} from "@/lib/analytics";
import { TodaysMove } from "@/components/analytics/todays-move";
import { MasteryNode } from "@/components/analytics/mastery-node";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

type ConceptJoin = {
  id: string;
  label: string;
  document_id: string;
  prereq_concept_ids: string[] | null;
  documents: { id: string; title: string; emoji: string | null } | null;
};

type MasteryWithConcept = {
  concept_id: string;
  mastery: number | null;
  ease: number | null;
  interval_days: number | null;
  reps: number | null;
  state: string | null;
  last_reviewed: string | null;
  next_review: string | null;
  concepts: ConceptJoin | null;
};

export default async function AnalyticsPage() {
  const supabase = createClient();

  // Every studied concept across every study space (RLS-scoped to the user).
  const { data: rows } = await supabase
    .from("concept_mastery")
    .select(
      "concept_id, mastery, ease, interval_days, reps, state, last_reviewed, next_review, " +
        "concepts(id, label, document_id, prereq_concept_ids, documents(id, title, emoji))"
    )
    .order("next_review", { ascending: true });

  const masteries = ((rows ?? []) as unknown as MasteryWithConcept[]).filter(
    (r) => r.concepts != null
  );

  // -------- EMPTY STATE: no mastery yet (no fake charts) --------
  if (masteries.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          <Activity className="h-3.5 w-3.5" /> Analytics
        </div>
        <h1 className="mt-3 font-display text-display-lg text-content-primary">
          Your decay clock hasn&rsquo;t started yet.
        </h1>
        <p className="mt-3 max-w-prose text-body-lg text-content-secondary">
          Analytics unlock as you learn. Finish one tutor check or quiz and your first decay clock
          starts — then this becomes the one place that tells you exactly what to review and when.
        </p>
        <div className="mt-7">
          <Button href="/library" variant="accent" size="lg">
            <BookOpen className="h-4 w-4" /> Go to your library
          </Button>
        </div>
      </main>
    );
  }

  // -------- deterministic math (the LLM never decides what to review) --------
  const now = new Date();

  const conceptsForFanout = masteries.map((m) => ({
    id: m.concepts!.id,
    prereq_concept_ids: m.concepts!.prereq_concept_ids,
  }));
  const fanout = prereqFanout(conceptsForFanout);

  const masteryRows: MasteryRow[] = masteries.map((m) => ({
    concept_id: m.concept_id,
    mastery: Number(m.mastery ?? 0),
    ease: Number(m.ease ?? 2.5),
    interval_days: Number(m.interval_days ?? 0),
    reps: Number(m.reps ?? 0),
    state: m.state ?? "weak",
    last_reviewed: m.last_reviewed,
    next_review: m.next_review,
  }));

  const ranked = rankConcepts(masteryRows, fanout, now);

  // Lookups for label / document by concept id.
  const byConcept = new Map(masteries.map((m) => [m.concept_id, m.concepts!]));

  // The single top-ranked decaying concept becomes Today's Move.
  const decayingCount = ranked.filter((r) => r.decaying).length;
  const top = ranked[0];
  const topConcept = top ? byConcept.get(top.concept_id) ?? null : null;

  // -------- group the mastery map by study space (document) --------
  type SpaceGroup = {
    docId: string;
    title: string;
    emoji: string | null;
    nodes: { conceptId: string; label: string; mastery: number; decaying: boolean }[];
  };
  const spaces = new Map<string, SpaceGroup>();
  for (const r of ranked) {
    const c = byConcept.get(r.concept_id);
    if (!c) continue;
    const doc = c.documents;
    const docId = doc?.id ?? c.document_id;
    if (!spaces.has(docId)) {
      spaces.set(docId, {
        docId,
        title: doc?.title ?? "Untitled space",
        emoji: doc?.emoji ?? null,
        nodes: [],
      });
    }
    spaces.get(docId)!.nodes.push({
      conceptId: r.concept_id,
      label: c.label,
      mastery: r.mastery,
      decaying: r.decaying,
    });
  }
  const spaceGroups = Array.from(spaces.values());

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
        <Activity className="h-3.5 w-3.5" /> Analytics
      </div>
      <h1 className="mt-2 font-display text-title-1 text-content-primary">The Next Action Engine</h1>
      <p className="mt-2 max-w-prose text-body text-content-secondary">
        Not a report — a forward scheduler. It decides what&rsquo;s decaying, when you&rsquo;ll
        forget it, and makes you review it now.
      </p>

      {/* ABOVE THE FOLD: Today's Move (the forced decision) */}
      {top && topConcept && (
        <div className="mt-7">
          <TodaysMove
            conceptId={top.concept_id}
            conceptLabel={topConcept.label}
            rationale={fallbackRationale(topConcept.label, top, now)}
            estMinutes={estimateMinutes(Math.max(1, decayingCount))}
            hoursToThreshold={hoursUntilThreshold(top, now)}
            prereqFanout={top.prereqFanout}
            initialMastery={top.mastery}
          />
        </div>
      )}

      {/* BELOW: the mastery map, grouped by study space */}
      <div className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-title-2 text-content-primary">Mastery map</h2>
          <span className="text-caption text-content-tertiary">
            {ranked.length} {ranked.length === 1 ? "concept" : "concepts"} ·{" "}
            {decayingCount} decaying
          </span>
        </div>

        <div className="mt-5 space-y-8">
          {spaceGroups.map((space) => (
            <section key={space.docId}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-headline text-content-primary">
                  {space.emoji ? `${space.emoji} ` : ""}
                  {space.title}
                </span>
                <span className="text-caption text-content-tertiary">
                  {space.nodes.length} {space.nodes.length === 1 ? "concept" : "concepts"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {space.nodes.map((n) => (
                  <MasteryNode
                    key={n.conceptId}
                    conceptId={n.conceptId}
                    label={n.label}
                    mastery={n.mastery}
                    tone={masteryTone(n.mastery)}
                    decaying={n.decaying}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Weekly Opus coaching (calibration_weekly) is deferred from this slice. */}
      <Card elevation="flat" className="mt-12 border-dashed">
        <div className="flex items-center gap-3 px-5 py-4 text-content-tertiary">
          <Sparkles className="h-4 w-4 shrink-0" />
          <p className="text-caption">
            Weekly coaching — an Opus letter reading your calibration trend — arrives in a later
            release.{" "}
            <Link href="/library" className="font-medium text-content-secondary hover:text-content-primary">
              Keep studying
            </Link>{" "}
            to feed it.
          </p>
        </div>
      </Card>
    </main>
  );
}
