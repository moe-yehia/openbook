import { cn } from "@/lib/utils";

/**
 * Concept-graph primitives (BUILD_SPEC §2.2/§7) — the connected-node motif that
 * recurs across mindmap, summary spine, tutor rail, analytics. Edges live in an
 * absolutely-positioned SVG layer behind HTML nodes (so node text is real DOM —
 * screen-reader + magnifier friendly). Relationship is encoded by LINE STYLE
 * (solid = prerequisite, dashed = related), never colour alone.
 */

export type EdgeVariant = "prereq" | "related";

export function ConceptEdge({
  x1,
  y1,
  x2,
  y2,
  variant = "related",
  active = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  variant?: EdgeVariant;
  active?: boolean;
}) {
  // Smooth vertical-biased cubic between the two anchors.
  const dx = (x2 - x1) * 0.5;
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={active ? "rgb(var(--ob-accent))" : "rgb(var(--ob-border-strong))"}
      strokeWidth={active ? 2 : 1.5}
      strokeDasharray={variant === "related" ? "4 5" : undefined}
      strokeLinecap="round"
    />
  );
}

export function ConceptNode({
  label,
  sublabel,
  tone = "neutral",
  active = false,
  className,
  style,
  ...props
}: {
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: "neutral" | "weak" | "shaky" | "solid" | "next";
  active?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const dot = {
    neutral: "bg-border-strong",
    weak: "bg-content-tertiary",
    shaky: "bg-warning",
    solid: "bg-success",
    next: "bg-accent",
  }[tone];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 shadow-e2",
        active ? "border-accent-ring shadow-accent" : "border-border",
        className
      )}
      style={style}
      {...props}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-callout font-semibold text-content-primary">
          {label}
        </span>
        {sublabel && <span className="text-caption text-content-tertiary">{sublabel}</span>}
      </span>
    </div>
  );
}
