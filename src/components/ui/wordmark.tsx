import Link from "next/link";
import { cn } from "@/lib/utils";

/** OpenBook wordmark — clean SF Pro Display text, no icon (brand rule). */
export function Wordmark({
  className,
  href = "/",
  as = "link",
}: {
  className?: string;
  href?: string;
  as?: "link" | "span";
}) {
  const content = (
    <span
      className={cn(
        "font-display text-title-3 font-bold tracking-[-0.02em] text-content-primary",
        className
      )}
    >
      OpenBook
    </span>
  );
  if (as === "span") return content;
  return (
    <Link href={href} aria-label="OpenBook home" className="inline-flex items-center">
      {content}
    </Link>
  );
}
