import { cn } from "@/lib/utils";

type RingTone = "weak" | "shaky" | "solid" | "next";

const toneStroke: Record<RingTone, string> = {
  weak: "rgb(var(--ob-text-tertiary))",
  shaky: "rgb(var(--ob-warning))",
  solid: "rgb(var(--ob-success))",
  next: "rgb(var(--ob-accent))", // the single lime "review next" beat
};

/**
 * Circular mastery ring (BUILD_SPEC §2.6) — fills with eased stroke-dashoffset.
 * A ring, never a bar. Status is also conveyed by the centre label, never colour alone.
 */
export function MasteryRing({
  value,
  tone = "solid",
  size = 44,
  stroke = 4,
  label,
  className,
}: {
  value: number; // 0..1
  tone?: RingTone;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  className?: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - v);

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(v * 100)}% mastered`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--ob-border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneStroke[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--ob-dur-slow) var(--ob-ease-spring)" }}
        />
      </svg>
      {label != null && (
        <span className="absolute font-mono text-caption tabular-nums text-content-secondary">
          {label}
        </span>
      )}
    </div>
  );
}
