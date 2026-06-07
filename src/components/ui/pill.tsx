import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-content-secondary border-border",
  accent: "bg-accent-subtle text-content-primary border-accent-ring/60",
  success: "bg-success-subtle text-success border-success/30",
  warning: "bg-warning-subtle text-warning border-warning/30",
  danger: "bg-danger-subtle text-danger border-danger/30",
  info: "bg-info-subtle text-info border-info/30",
};

/** A small status/label chip. Status tones always pair with an icon (never colour alone). */
export function Pill({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-caption-sm uppercase tracking-[0.05em]",
        tones[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
