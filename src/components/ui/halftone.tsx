import { cn } from "@/lib/utils";

/**
 * Dotted-halftone texture (BUILD_SPEC §8.1) — a radial-masked dot field at ~3%
 * ink that bleeds from a corner. Never a full grid. Decorative only, so it is
 * hidden in ADHD focus mode via [data-decorative].
 */
export function Halftone({
  className,
  from = "top-left",
  dotColor = "currentColor",
  opacity = 0.04,
}: {
  className?: string;
  from?: "top-left" | "top-right" | "top" | "center";
  dotColor?: string;
  opacity?: number;
}) {
  const maskPos = {
    "top-left": "0% 0%",
    "top-right": "100% 0%",
    top: "50% 0%",
    center: "50% 50%",
  }[from];

  return (
    <div
      data-decorative
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 text-content-primary", className)}
      style={{
        opacity,
        backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1.4px)`,
        backgroundSize: "14px 14px",
        WebkitMaskImage: `radial-gradient(120% 90% at ${maskPos}, black, transparent 70%)`,
        maskImage: `radial-gradient(120% 90% at ${maskPos}, black, transparent 70%)`,
      }}
    />
  );
}
