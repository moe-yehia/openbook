import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Glassmorphic surface for the floating pill nav and spatial panels.
 *  Degrades to a solid surface under prefers-reduced-transparency (see globals.css). */
export const GlassPanel = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function GlassPanel({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("ob-glass rounded-pill shadow-float", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
