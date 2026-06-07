import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "ghost" | "inverse";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium " +
  "transition-[transform,background-color,box-shadow,border-color] duration-fast ease-standard " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  // The signature CTA: black pill (light) / white pill (dark).
  primary:
    "bg-cta text-cta-foreground hover:shadow-e3 hover:-translate-y-px shadow-e2",
  // Lime — used sparingly for the single focal action.
  accent:
    "bg-accent text-accent-foreground hover:bg-accent-hover shadow-e2 hover:shadow-accent",
  outline:
    "border border-border-strong bg-transparent text-content-primary hover:bg-surface-sunken",
  ghost: "bg-transparent text-content-secondary hover:bg-surface-sunken hover:text-content-primary",
  inverse:
    "bg-surface-inverse text-content-inverse hover:opacity-90 shadow-e2",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-callout",
  md: "h-11 px-5 text-callout",
  lg: "h-12 px-7 text-headline",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ variant = "primary", size = "md", className, children, ...props }, ref) {
    const classes = cn(base, variants[variant], sizes[size], className);
    if ("href" in props && props.href !== undefined) {
      const { href, ...rest } = props as ButtonAsLink;
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          {...rest}
        >
          {children}
        </Link>
      );
    }
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        {...(props as ButtonAsButton)}
      >
        {children}
      </button>
    );
  }
);
