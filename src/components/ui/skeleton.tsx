import { cn } from "@/lib/utils";

/** Calm dotted-halftone shimmer (never a strobing gray pulse). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("ob-shimmer rounded-md", className)}
      {...props}
    />
  );
}
