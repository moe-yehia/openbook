"use client";

import { useState } from "react";
import { Check, AlertTriangle, X as XIcon, Info } from "lucide-react";
import { Wordmark } from "@/components/ui/wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle, CardDescription } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { MasteryRing } from "@/components/ui/mastery-ring";
import { ConceptNode, ConceptEdge } from "@/components/ui/concept-graph";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Halftone } from "@/components/ui/halftone";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-12">
      <h2 className="mb-6 font-display text-title-2 text-content-primary">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-14 rounded-md border border-border"
        style={{ background: `rgb(var(--ob-${token}))` }}
      />
      <div className="text-caption text-content-secondary">{label}</div>
      <code className="text-caption-sm text-content-tertiary">--ob-{token}</code>
    </div>
  );
}

// Full literal class strings so Tailwind's JIT detects them (no dynamic `text-${x}`).
const typeScale = [
  ["display-2xl", "font-display text-display-2xl", "Reading isn't learning"],
  ["display-xl", "font-display text-display-xl", "A summary is not studying"],
  ["display-lg", "font-display text-display-lg", "Make it stick"],
  ["title-1", "font-display text-title-1", "My Learning Plan"],
  ["title-2", "font-display text-title-2", "Concept clusters"],
  ["title-3", "font-display text-title-3", "Card title"],
  ["headline", "text-headline", "Emphasized lead-in"],
  ["body-lg", "text-body-lg", "Comfortable long-form reading baseline."],
  ["body", "text-body", "Default UI body and card descriptions."],
  ["callout", "text-callout", "Buttons and pill nav labels"],
  ["caption", "text-caption", "Metadata, helper text, timestamps"],
] as const;

export default function DesignSystem() {
  const [seg, setSeg] = useState("got");

  return (
    <main className="relative mx-auto max-w-5xl px-6 pb-24">
      <Halftone from="top-right" opacity={0.04} />

      <header className="flex items-center justify-between py-8">
        <Wordmark />
        <Button href="/" variant="ghost" size="sm">
          ← Home
        </Button>
      </header>
      <p className="max-w-xl text-body-lg text-content-secondary">
        OpenBook design system — SF Pro, a single lime scalpel on warm/dark editorial surfaces.
        Toggle theme, dyslexia, focus, colour-vision and the reading lens from the{" "}
        <span className="font-medium text-content-primary">Access</span> pill (bottom-left).
      </p>

      <Section title="Colour — surfaces & text">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ["background", "Canvas"],
            ["surface", "Surface"],
            ["surface-elevated", "Elevated"],
            ["surface-sunken", "Sunken"],
            ["surface-inverse", "Inverse"],
            ["border", "Border"],
            ["text-primary", "Text 1°"],
            ["text-secondary", "Text 2°"],
            ["text-tertiary", "Text 3°"],
          ].map(([t, l]) => (
            <Swatch key={t} token={t} label={l} />
          ))}
        </div>
      </Section>

      <Section title="Colour — accent & semantic quad">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ["accent", "Accent (lime)"],
            ["accent-subtle", "Accent wash"],
            ["success", "Success"],
            ["warning", "Warning"],
            ["danger", "Danger"],
            ["info", "Info"],
          ].map(([t, l]) => (
            <Swatch key={t} token={t} label={l} />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Pill tone="accent">Mastered</Pill>
          <Pill tone="success" icon={<Check className="h-3 w-3" />}>Correct</Pill>
          <Pill tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>Review soon</Pill>
          <Pill tone="danger" icon={<XIcon className="h-3 w-3" />}>Incorrect</Pill>
          <Pill tone="info" icon={<Info className="h-3 w-3" />}>Thinking</Pill>
        </div>
      </Section>

      <Section title="Typography — SF Pro">
        <div className="space-y-3">
          {typeScale.map(([name, cls, sample]) => (
            <div key={name} className="flex items-baseline gap-6">
              <code className="w-28 shrink-0 text-caption-sm text-content-tertiary">{name}</code>
              <span className={`${cls} text-content-primary`}>{sample}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-6">
            <code className="w-28 shrink-0 text-caption-sm text-content-tertiary">mono-numeral</code>
            <span className="font-mono text-mono-numeral tabular-nums text-content-primary">
              0123456789 · 98% · 14h
            </span>
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Start learning</Button>
          <Button variant="accent">Review next</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="inverse">Inverse panel</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Cards & mastery rings">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card interactive>
            <CardBody className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <CardTitle>Krebs Cycle</CardTitle>
                <MasteryRing value={0.32} tone="next" size={40} label="32" />
              </div>
              <CardDescription>You&rsquo;ll forget this in ~14h. Prerequisite for 3 exam topics.</CardDescription>
            </CardBody>
          </Card>
          <Card interactive>
            <CardBody className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <CardTitle>Glycolysis</CardTitle>
                <MasteryRing value={0.64} tone="shaky" size={40} label="64" />
              </div>
              <CardDescription>Shaky — surfaced again next session.</CardDescription>
            </CardBody>
          </Card>
          <Card interactive>
            <CardBody className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <CardTitle>Cell Membrane</CardTitle>
                <MasteryRing value={0.93} tone="solid" size={40} label="93" />
              </div>
              <CardDescription>Solid. Dimmed so you focus elsewhere.</CardDescription>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="Concept graph">
        <div className="relative h-44">
          <svg className="absolute inset-0 h-full w-full" aria-hidden>
            <ConceptEdge x1={90} y1={28} x2={70} y2={120} variant="prereq" active />
            <ConceptEdge x1={90} y1={28} x2={300} y2={120} variant="related" />
          </svg>
          <div className="absolute left-4 top-3">
            <ConceptNode label="Cellular Respiration" sublabel="central concept" tone="next" active />
          </div>
          <div className="absolute left-10 top-28">
            <ConceptNode label="Glycolysis" tone="shaky" />
          </div>
          <div className="absolute left-[280px] top-28">
            <ConceptNode label="ATP yield" tone="solid" />
          </div>
        </div>
      </Section>

      <Section title="Segmented control · skeleton · glass">
        <div className="flex flex-wrap items-center gap-8">
          <SegmentedControl
            ariaLabel="Confidence"
            options={[
              { value: "got", label: "Got it" },
              { value: "shaky", label: "Shaky" },
              { value: "lost", label: "Lost" },
            ]}
            value={seg}
            onChange={setSeg}
          />
          <div className="ob-glass flex items-center gap-3 rounded-pill px-5 py-2.5">
            <Wordmark as="span" />
            <span className="text-callout text-content-tertiary">glass pill nav</span>
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </Section>
    </main>
  );
}
