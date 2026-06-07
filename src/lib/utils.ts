import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge configured for OpenBook's custom type scale. Without this,
 * twMerge can't distinguish our custom font-size utilities (text-callout,
 * text-title-1, …) from text-COLOR utilities (text-cta-foreground, …) — both
 * begin with `text-` — and would drop the color when both appear, leaving
 * labels invisible. Registering the sizes under `font-size` keeps them separate.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-2xl",
            "display-xl",
            "display-lg",
            "title-1",
            "title-2",
            "title-3",
            "headline",
            "body-lg",
            "body",
            "callout",
            "caption",
            "caption-sm",
            "mono",
            "mono-numeral",
          ],
        },
      ],
    },
  },
});

/** The single class helper used across every OpenBook component. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
