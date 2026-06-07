import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Adds the signature hover-lift micro-interaction. */
  interactive?: boolean;
  /** Elevation tier at rest. */
  elevation?: "flat" | "e1" | "e2" | "e3";
};

const elevationClass = {
  flat: "shadow-none",
  e1: "shadow-e1",
  e2: "shadow-e2",
  e3: "shadow-e3",
} as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, elevation = "e2", children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-border bg-surface text-content-primary",
        elevationClass[elevation],
        interactive &&
          "transition-[transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-e3",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-3", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-title-3 text-content-primary", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-body text-content-secondary", className)} {...props} />;
}
