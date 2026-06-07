import type { Config } from "tailwindcss";

/** rgb(var(--ob-x) / <alpha-value>) so alpha modifiers (bg-surface/70) work. */
const c = (name: string) => `rgb(var(--ob-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", "[data-theme='dark']"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: c("background"),
        surface: {
          DEFAULT: c("surface"),
          elevated: c("surface-elevated"),
          sunken: c("surface-sunken"),
          inverse: c("surface-inverse"),
        },
        border: {
          DEFAULT: c("border"),
          strong: c("border-strong"),
        },
        content: {
          primary: c("text-primary"),
          secondary: c("text-secondary"),
          tertiary: c("text-tertiary"),
          inverse: c("text-on-inverse"),
          asleep: c("text-asleep"),
        },
        accent: {
          DEFAULT: c("accent"),
          hover: c("accent-hover"),
          foreground: c("accent-foreground"),
          subtle: c("accent-subtle"),
          ring: c("accent-ring"),
        },
        cta: {
          DEFAULT: c("cta"),
          foreground: c("cta-foreground"),
        },
        success: { DEFAULT: c("success"), subtle: c("success-subtle") },
        warning: { DEFAULT: c("warning"), subtle: c("warning-subtle") },
        danger: { DEFAULT: c("danger"), subtle: c("danger-subtle") },
        info: { DEFAULT: c("info"), subtle: c("info-subtle") },
        "focus-ring": c("focus-ring"),
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-text)"],
        mono: ["var(--font-mono)"],
        dyslexic: ["var(--font-dyslexic)"],
      },
      // SF Pro type scale (BUILD_SPEC §2.3) — [size, { lineHeight, letterSpacing, fontWeight }]
      fontSize: {
        "display-2xl": ["4.75rem", { lineHeight: "0.98", letterSpacing: "-0.035em", fontWeight: "700" }],
        "display-xl": ["3.75rem", { lineHeight: "1.02", letterSpacing: "-0.03em", fontWeight: "700" }],
        "display-lg": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.028em", fontWeight: "700" }],
        "title-1": ["2.125rem", { lineHeight: "1.12", letterSpacing: "-0.022em", fontWeight: "600" }],
        "title-2": ["1.625rem", { lineHeight: "1.18", letterSpacing: "-0.018em", fontWeight: "600" }],
        "title-3": ["1.3125rem", { lineHeight: "1.24", letterSpacing: "-0.014em", fontWeight: "600" }],
        headline: ["1.0625rem", { lineHeight: "1.4", letterSpacing: "-0.011em", fontWeight: "600" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.55", letterSpacing: "-0.006em", fontWeight: "400" }],
        body: ["0.9375rem", { lineHeight: "1.5", letterSpacing: "-0.003em", fontWeight: "400" }],
        callout: ["0.875rem", { lineHeight: "1.45", letterSpacing: "0", fontWeight: "500" }],
        caption: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0.002em", fontWeight: "400" }],
        "caption-sm": ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.05em", fontWeight: "600" }],
        mono: ["0.84375rem", { lineHeight: "1.55", letterSpacing: "0", fontWeight: "450" }],
        "mono-numeral": ["0.9375rem", { lineHeight: "1.2", letterSpacing: "0", fontWeight: "500" }],
      },
      spacing: {
        // 4px grid extras
        18: "4.5rem",
        22: "5.5rem",
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        md: "16px",
        lg: "22px",
        xl: "28px",
        "2xl": "36px",
        card: "28px",
        pill: "999px",
      },
      boxShadow: {
        e1: "var(--ob-e1)",
        e2: "var(--ob-e2)",
        e3: "var(--ob-e3)",
        e4: "var(--ob-e4)",
        e5: "var(--ob-e5)",
        e6: "var(--ob-e6)",
        float: "var(--ob-float)",
        accent: "var(--ob-e-accent)",
      },
      transitionTimingFunction: {
        standard: "var(--ob-ease-standard)",
        entrance: "var(--ob-ease-entrance)",
        exit: "var(--ob-ease-exit)",
        spring: "var(--ob-ease-spring)",
        ob: "var(--ease-ob)",
      },
      transitionDuration: {
        instant: "80ms",
        fast: "140ms",
        base: "220ms",
        slow: "320ms",
        slowest: "480ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
        "pop-spring": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--ob-dur-base) var(--ob-ease-entrance)",
        "scale-in": "scale-in var(--ob-dur-base) var(--ob-ease-entrance)",
        shake: "shake 180ms var(--ob-ease-standard)",
        "pop-spring": "pop-spring var(--ob-dur-base) var(--ob-ease-spring)",
      },
      maxWidth: {
        reading: "66ch",
        prose: "48rem",
      },
    },
  },
  plugins: [],
};
export default config;
