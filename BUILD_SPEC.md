# OpenBook — Master Build Spec

> **Source of truth for the entire build.** OpenBook is an AI **active-learning** platform: it guides students through their own material with interactive retrieval-practice loops, never one-shot generation. This document is concrete, internally consistent, and sized for the existing repo (Next.js 14 App Router + TypeScript + Tailwind + Supabase + Anthropic Claude). Build against it directly.

**Repo facts this spec is grounded in** (already present): `@anthropic-ai/sdk@^0.102`, `@supabase/ssr`, `@supabase/supabase-js`, `zod@^4`, `framer-motion@^12`, `lucide-react`, `clsx`, `tailwind-merge`, Next `14.2.35`, Tailwind `3.4`. Model tiers are wired in `src/lib/anthropic.ts` as `model('fast'|'balanced'|'deep')` reading env (`ANTHROPIC_MODEL_FAST=claude-haiku-4-5`, `ANTHROPIC_MODEL_BALANCED=claude-sonnet-4-6`, `ANTHROPIC_MODEL_DEEP=claude-opus-4-8`). The existing Geist woff files in `src/app/fonts/` and the `Arial` body font in `globals.css` are **removed** per brand.

---

## Table of Contents
1. [Product overview & the active-learning thesis](#1-product-overview--the-active-learning-thesis)
2. [Design system](#2-design-system)
3. [Information architecture & route tree](#3-information-architecture--route-tree)
4. [Supabase schema + RLS](#4-supabase-schema--rls)
5. [Anthropic / Claude integration & model routing](#5-anthropic--claude-integration--model-routing)
6. [Ingestion + RAG pipeline](#6-ingestion--rag-pipeline)
7. [The 10 MVP features](#7-the-10-mvp-features)
8. [Landing page spec](#8-landing-page-spec)
9. [Phased implementation roadmap](#9-phased-implementation-roadmap)

---

## 1. Product overview & the active-learning thesis

**THESIS: active learning, not content delivery.** Competitors (NotebookLM, StudyFetch, YouLearn, Studley) take an upload and emit an output — a summary, a quiz — then walk away. That is passive consumption and produces almost no durable retention (rereading and reviewing pre-made summaries feel like learning but don't stick). OpenBook is built so that **every feature is a closed interactive loop** that makes the student *retrieve, generate, calibrate, and revisit* — the four highest-evidence techniques in learning science.

The non-negotiable product law, enforced in every feature spec below:

> **Claude is the coach, never the author.** The student produces the cognitively effortful work (an answer, an explanation, a node label, a prediction); Claude prompts, grades, corrects, connects, and schedules. The kept artifact is one the student co-authored.

Three learning-science levers fire across the product and recur as design constraints:
- **Retrieval practice / testing effect** — the student must attempt recall before any answer is revealed. Structurally gated, never skippable (with one polite escape per gate for ADHD/time-pressed users).
- **Generation effect** — predict-before-reveal and free-recall produce the answer before seeing it.
- **Spacing** — misses and weak concepts are scheduled (FSRS for flashcards; SM-2-lite for concepts/notes/vocab) to resurface at the edge of forgetting.

**Inputs students connect:** PDF, Word, PowerPoint, Google Docs, images (PNG/JPG), code/notebooks (`.ipynb`/`.md`), YouTube URLs, GitHub repos.

**Secondary market (first-class, woven in, never bolted on):** students with ADHD, Dyslexia, Color Blindness, and Weak Eyesight. Four composable accessibility modes (Reading Lens magnifier/bold, Dyslexia spacing, ADHD focus, Colorblind-safe) ship as `<html>` data-attributes and persist to Supabase.

**Brand:** name **OpenBook**; wordmark-only logo (SF Pro text, no icon); single lime accent `#C0FE6F` used sparingly; dark base `#242424`/`#2C2C2C`; both light and dark mode. Design philosophy = Apple HIG (sleek, purposeful, cohesive). Typography = SF Pro exclusively.

---

## 2. Design system

The system encodes the Apple-HIG philosophy and the curated design DNA: tight-tracked bold display headlines, calm editorial whitespace, large rounded soft-shadow cards, floating glass pill nav, black/white pill CTAs, dotted-halftone texture, **one sparing lime pop per view**, connected concept nodes.

### 2.1 Core idea: lime is a scalpel, not a paintbrush
`#C0FE6F` is high-luminance — flooding it kills contrast and cheapens the brand. The accent is **structurally reserved**: primary CTAs are the **black pill (light) / white pill (dark)**; brand lime appears **once per view** as the focal beat (active concept node, mastery ring, a single highlighted word, the correct-answer burst, the "review next" item). System status uses a **separate colorblind-safe quad** (green/amber/red/blue) so "brand accent" never collides with "success." The **focus ring is blue** — unmistakable, never confused with lime.

### 2.2 Color tokens

Define every token as a CSS variable under `:root` (light) and `[data-theme='dark']` (dark) in `globals.css`; map semantic names in `tailwind.config.ts` under `theme.extend.colors`. Drive dark mode with a **`class`/data-attribute strategy** (`darkMode: ['class', "[data-theme='dark']"]`) so the nav can offer a manual toggle, not only `prefers-color-scheme`. Every text token is annotated with its measured contrast ratio.

#### Light tokens
| Token | Value | Usage |
|---|---|---|
| `--ob-background` | `#F7F6F3` | App canvas. Warm off-white (paper, not clinical `#FFF`); keeps lime from vibrating. |
| `--ob-surface` | `#FFFFFF` | Primary card / sheet fill. |
| `--ob-surface-elevated` | `#FFFFFF` | Modals, popovers, floating pill nav — same fill, stronger shadow tier. |
| `--ob-surface-sunken` | `#EEEDE8` | Inset wells: search fields, segmented tracks, code blocks, progress troughs. |
| `--ob-surface-inverse` | `#1C1C1C` | Signature near-black panel for stat strips / footers in light mode. |
| `--ob-border` | `#E3E1DA` | Default hairline divider/card outline (1px, calm). |
| `--ob-border-strong` | `#C9C6BD` | Input borders, emphasized dividers, hover outlines. |
| `--ob-text-primary` | `#1A1A1A` | Headlines and body. 15.8:1 — **AAA**. |
| `--ob-text-secondary` | `#55524B` | Supporting copy, card descriptions. 8.0:1 — **AAA**. |
| `--ob-text-tertiary` | `#86837B` | Captions, metadata, placeholders, disabled. 4.6:1 — **AA**. |
| `--ob-text-on-inverse` | `#F3F2EE` | Text on near-black panels. |
| `--ob-accent` | `#C0FE6F` | THE lime. One focal pop per view. Never large body text. |
| `--ob-accent-hover` | `#B2F559` | Hover/active of accent-filled controls. |
| `--ob-accent-foreground` | `#15240A` | Text/icons ON lime. 11.6:1 — **AAA**. (White-on-lime FAILS, so lime is never a default text-button.) |
| `--ob-accent-subtle` | `#EAF9D4` | Tinted lime wash: selected rows, "mastered" chips, accent card backgrounds. |
| `--ob-accent-ring` | `#9FE34A` | Border/ring for accent-subtle surfaces. |
| `--ob-cta` | `#1A1A1A` | Primary CTA = black pill in light mode. |
| `--ob-cta-foreground` | `#FFFFFF` | Text on black pill. |
| `--ob-success` | `#2E8B57` | Correct/completed/mastery. Distinct from lime. 4.7:1 — **AA**. |
| `--ob-success-subtle` | `#DBF0E4` | Success row/toast bg. |
| `--ob-warning` | `#B7791F` | "Review soon", low-confidence, partial. 4.6:1 — **AA**. |
| `--ob-warning-subtle` | `#FBEFD3` | Warning bg. |
| `--ob-danger` | `#D14343` | Incorrect/destructive/expired. ALWAYS paired with icon/shape. |
| `--ob-danger-subtle` | `#FBE3E1` | Danger bg. |
| `--ob-info` | `#3F6FE0` | Neutral info / "AI is thinking" / hints. |
| `--ob-info-subtle` | `#E2EAFB` | Info bg. |
| `--ob-focus-ring` | `#1A6FE0` | Keyboard focus halo — **blue, never lime**. 3px outline + 2px offset. |
| `--ob-overlay` | `rgba(26,24,20,0.42)` | Scrim behind modals/sheets. |
| `--ob-glass-fill` | `rgba(255,255,255,0.62)` | Glass pill nav / spatial panels; pair with `backdrop-blur(28px) saturate(160%)`. |
| `--ob-glass-border` | `rgba(255,255,255,0.55)` | Top/inner highlight edge for glass. |

#### Dark tokens (`[data-theme='dark']`)
| Token | Value | Usage |
|---|---|---|
| `--ob-background` | `#1E1E1E` | Dark canvas — one step below brand base so cards lift off it. Not pure black (weak-eyesight market). |
| `--ob-surface` | `#242424` | Primary card fill — official OpenBook dark base. |
| `--ob-surface-elevated` | `#2C2C2C` | Modals, popovers, pill nav — second official dark base, elevated tier. |
| `--ob-surface-sunken` | `#171717` | Inset wells. |
| `--ob-surface-inverse` | `#F3F2EE` | Rare light panel for high-emphasis moments. |
| `--ob-border` | `#363636` | Default hairline (borders do separation work; shadows barely read on near-black). |
| `--ob-border-strong` | `#4A4A4A` | Input borders, hover outlines. |
| `--ob-text-primary` | `#F4F3EF` | Headlines/body. Warm off-white, 14.9:1 — **AAA**. (Pure `#FFF` avoided to cut halation.) |
| `--ob-text-secondary` | `#B4B2AB` | Supporting copy. 7.4:1 — **AAA**. |
| `--ob-text-tertiary` | `#8A887F` | Captions, metadata, placeholders. 4.6:1 — **AA**. |
| `--ob-text-on-inverse` | `#1A1A1A` | Text on the rare light panel. |
| `--ob-accent` | `#C0FE6F` | Same lime; on dark reads as a glowing focal pop. |
| `--ob-accent-hover` | `#CDFF85` | Hover lightens for tactile lift. |
| `--ob-accent-foreground` | `#15240A` | Deep green-black on lime — 11.6:1, identical pairing across modes. |
| `--ob-accent-subtle` | `#2A361A` | Desaturated lime-tinted surface for selected rows / "mastered" chips. |
| `--ob-accent-ring` | `#5C7A33` | Border/ring for accent-subtle surfaces. |
| `--ob-cta` | `#F4F3EF` | Primary CTA = light/white pill in dark mode. |
| `--ob-cta-foreground` | `#1A1A1A` | Text on light pill. |
| `--ob-success` | `#5BC489` | Lightened for dark. 5.9:1 — **AA**. |
| `--ob-success-subtle` | `#1C3327` | Success bg. |
| `--ob-warning` | `#E0A53D` | Amber tuned up. 6.8:1 — **AA**. |
| `--ob-warning-subtle` | `#352A14` | Warning bg. |
| `--ob-danger` | `#F0716B` | Lightened red. 5.4:1 — **AA**. Always icon-paired. |
| `--ob-danger-subtle` | `#3A201F` | Danger bg. |
| `--ob-info` | `#6E9BFF` | Info/hint blue. 6.1:1 — **AA**. |
| `--ob-info-subtle` | `#1E2A42` | Info bg. |
| `--ob-focus-ring` | `#6E9BFF` | Blue focus halo — never lime. 3px outline + 2px offset. |
| `--ob-overlay` | `rgba(0,0,0,0.58)` | Scrim. |
| `--ob-glass-fill` | `rgba(38,38,38,0.55)` | Glass; `backdrop-blur(28px) saturate(140%)`. |
| `--ob-glass-border` | `rgba(255,255,255,0.10)` | Subtle top highlight edge. |

**Contrast & colorblindness rule:** Status is **never hue-only** — always icon + shape + text (`✓` success, `!` warning, `✕` danger, `i` info). The semantic quad separates by *lightness* as well as hue across deuter/protan/tritan, with `[data-cvd='deut|prot|trit']` override layers (e.g. deut: nudge success toward teal, warning toward orange). Concept-graph edges use **line style** (solid = prereq, dashed = related) in addition to color. The lime accent is decorative/focal only — it never alone encodes meaning.

### 2.3 Typography — SF Pro

| Token | Size (px) | Weight | Line-height | Tracking | Family | Usage |
|---|---|---|---|---|---|---|
| `display-2xl` | 76 | 700 | 0.98 | −0.035em | Display | Hero headlines. Desktop only; clamps down on mobile. |
| `display-xl` | 60 | 700 | 1.02 | −0.03em | Display | Secondary hero / big section openers. |
| `display-lg` | 48 | 700 | 1.05 | −0.028em | Display | Page titles, marquee stat numbers. |
| `title-1` | 34 | 600 | 1.12 | −0.022em | Display | Major section headings ("My Learning Plan"). |
| `title-2` | 26 | 600 | 1.18 | −0.018em | Display | Card cluster headings, modal titles. |
| `title-3` | 21 | 600 | 1.24 | −0.014em | Display | Card titles, concept-node labels. |
| `headline` | 17 | 600 | 1.4 | −0.011em | Text | Emphasized lead-ins, list-item titles, active tab. |
| `body-lg` | 17 | 400 | 1.55 | −0.006em | Text | Long-form reading / lesson content. Apple comfortable-reading baseline. |
| `body` | 15 | 400 | 1.5 | −0.003em | Text | Default UI body, card descriptions. |
| `callout` | 14 | 500 | 1.45 | 0 | Text | Buttons, pill nav labels, chips, segmented controls. |
| `caption` | 13 | 400 | 1.4 | 0.002em | Text | Metadata, helper text, timestamps. |
| `caption-sm` | 11 | 600 | 1.3 | 0.05em | Text | Eyebrow/overline (UPPERCASE), kickers, badges. |
| `mono` | 13.5 | 450 | 1.55 | 0 | Mono | Code, `.ipynb` cells, citation IDs, tabular numerals. |
| `mono-numeral` | 15 | 500 | 1.2 | 0 | Mono | Stat counters, timers, streaks, %, scores (`tabular-nums` so digits don't jitter). |

**Display engages at ≥20px** (Apple's optical cut), which is why `title-1` and up use Display. Set `font-optical-sizing:auto`, `-webkit-font-smoothing:antialiased`, `text-rendering:optimizeLegibility` globally.

### 2.4 Font-loading strategy (SF Pro is Apple-licensed — we do NOT ship woff)

Expose a wordmark-grade SF stack and let the OS provide the real faces locally, with a robust cross-platform fallback. **No `next/font/google`, no Inter/Roboto** — that violates brand DNA.

```css
/* globals.css */
@font-face{font-family:'OB Display';src:local('SF Pro Display'),local('SFProDisplay-Regular'),local('-apple-system');font-weight:400 700;font-display:swap;}
@font-face{font-family:'OB Text';src:local('SF Pro Text'),local('SFProText-Regular'),local('-apple-system');font-weight:400 600;font-display:swap;}

:root{
  --font-display:'OB Display','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --font-text:'OB Text','SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --font-mono:'SF Mono','SFMono-Regular',ui-monospace,'Menlo','Cascadia Code','Roboto Mono',monospace;
  --font-dyslexic:'OpenDyslexic','Comic Sans MS',var(--font-text);
}
```

Tailwind: `fontFamily: { display:['var(--font-display)'], sans:['var(--font-text)'], mono:['var(--font-mono)'], dyslexic:['var(--font-dyslexic)'] }`.

**Dyslexia toggle:** self-host **OpenDyslexic** (SIL-licensed, shippable) as woff2 in `/public/fonts`. When `[data-dyslexia='on']` on `<html>`, swap `--font-text`/`--font-display` to `var(--font-dyslexic)` while keeping the type scale, color, and layout intact. Mono stays mono (code integrity). Numerals use SF Mono with `font-variant-numeric:tabular-nums` on counters; SF Pro lining figures elsewhere.

**Performance:** families are system-local first → zero network at first paint for Apple users; only OpenDyslexic (opt-in) and SF Mono fallbacks ever download. `font-display:swap` prevents invisible-text flashes.

### 2.5 Spacing, radii, elevation
- **4px grid.** Spacing scale: `4 8 12 16 20 24 32 40 48 64 80 96`.
- **Concentric-corner radii:** `xs 6 → sm 10 → md 16 → lg 22 → xl 28 → 2xl 36 → pill 999`. Tailwind: `borderRadius: { card:'28px', pill:'999px', ... }`.
- **Six-tier soft elevation** (`e1…e6`), softest = card resting, deepest = modal. Tailwind `boxShadow.float` = `0 24px 60px -24px rgba(26,26,24,.18), 0 2px 8px -2px rgba(26,26,24,.08)` (light). Dark relies on **borders + inner top-highlight** because shadows barely read on near-black.
- **`e-accent`:** the single sanctioned lime focus-glow for celebratory beats.
- **Glassmorphic tier** for pill nav / spatial panels (see glass tokens). Respect `prefers-reduced-transparency` → drop glass to solid `--ob-surface-elevated`.

### 2.6 Motion language
Motion clarifies state change; it never decorates. Short, eased, interruptible — Apple restraint. Everything respects `prefers-reduced-motion`.

**Durations** (`--ob-dur-*`): `instant 80ms` (toggles), `fast 140ms` (hover/press/focus-ring), `base 220ms` (most enter/exit, tab/segment slide), `slow 320ms` (modal/sheet/accordion/route cross-fade), `slowest 480ms` (page hero stagger, concept-graph relayout).

**Easings** (`--ob-ease-*`): `standard cubic-bezier(.2,0,0,1)` (iOS default); `entrance cubic-bezier(.16,1,.3,1)`; `exit cubic-bezier(.4,0,1,1)`; `spring cubic-bezier(.34,1.56,.64,1)` — **only** for celebratory beats (mastery, correct answer, streak +1), never routine UI.

**Signature transitions:**
- **Hover-lift cards:** `translateY(-2px)` + shadow `e2→e3`, fast/standard.
- **Press:** `scale(.98)` + shadow drop, instant; release on standard.
- **Floating pill nav puck:** active item is a sliding lime-or-black puck via framer-motion `layoutId`, spring-lite `(.34,1.1,.5,1)` at base.
- **Concept-graph reveal:** nodes fade+scale-in (from .96) staggered 40ms as edges draw (SVG `stroke-dashoffset` 0→full) over slowest.
- **Streaming AI text:** tokens fade-in opacity 0→1 over 120ms each + a 2px lime caret pulsing (opacity 1↔.3, 900ms) while generating; caret removed on stop.
- **Mastery ring fill:** SVG circle `stroke-dashoffset` eases over slow, spring on final 10% for a satisfying "lock-in".

**Micro-interactions:** Correct answer → success-subtle flash + a single ≤6-particle 8px lime confetti burst + spring scale 1→1.04→1. Wrong → 2-cycle 6px horizontal shake over 180ms (paired with danger color + `✕`, never color alone). Toast → slides from bottom-right `translateY(16px)`+fade. Skeleton → slow (1400ms) gradient sweep at 8% contrast (calm, not strobing); use **dotted-halftone shimmer**, not generic gray pulse. Magnifier lens → scales in from .9, tracks cursor 1:1 (no transition, never lags).

**Reduced motion** (`prefers-reduced-motion: reduce` OR `[data-reduced-motion='on']` OR ADHD focus): all translate/scale/spring collapse to opacity cross-fades capped at 120ms; confetti, shake, caret-pulse, shimmer sweep, graph stroke-draw disabled (graph nodes simply appear); mastery ring snaps to value; layout-id puck jumps instantly. Honor via a global `@media` block AND a JS-readable data-attribute so ADHD focus mode can force it independently of OS settings.

### 2.7 Accessibility system (product pillar)
Four composable modes on `<html>` data-attributes, persisted to `profiles.prefs`, SSR-safe, never forced by a study-room host. A floating **Accessibility** control (bottom-left glass pill) opens a sheet toggling them. Flags: `data-theme`, `data-dyslexia`, `data-focus`, `data-cvd`, `data-reduced-motion`, `data-lens`.

1. **Reading Lens** (`data-lens='magnify|bold'`) — the signature flourish, two interchangeable modes:
   - **Magnify:** a fixed circular overlay lens (default 160px, scroll-to-resize 96–280px) follows the cursor, renders a 1.8–3× zoom (slider) of whatever is under it via a cloned/transformed layer clipped to a circle (1px border + e3 shadow + faint lime ring). It is an **overlay — underlying layout never reflows**, design preserved pixel-for-pixel.
   - **Bold/Boost:** hovered text node gets `font-weight +200` and `letter-spacing +0.01em` transiently (weight-only transition reserves space, so **no layout reflow**). Works on body, captions, code.
   - Keyboard: hold **Alt** to summon at caret; arrows nudge. Disabled inside text inputs. Tracks 1:1 even under reduced-motion.
2. **Dyslexia** (`data-dyslexia='on'`) — OpenDyslexic + `letter-spacing 0.035em` + `word-spacing 0.12em` + line-height +0.2 + ~66ch measure + never-justified left-align + optional reading-ruler band. Purely typographic — zero layout breakage. Mono/code stays mono. Grading everywhere is **meaning-based, never spelling-strict**, so dyslexic students aren't penalized for orthography.
3. **ADHD focus** (`data-focus='on'`) — spotlight the active learning card; dim/blur the rest to ~35% + slight blur; hide decorative texture and non-essential chrome; collapse sidebars; force reduced-motion; surface one "Next step." Directly serves the active-learning thesis (one concept at a time). Optional Pomodoro ring in the nav.
4. **Colorblind-safe** (`data-cvd`) — always-on icon/shape encoding + sub-mode token overrides + **blue (non-lime) focus ring**.

**Cross-cutting:** WCAG-AA minimum on all text/UI (most pairings AAA); visible 3px blue `:focus-visible` ring + 2px offset on every interactive element (no mouse-focus rings); full keyboard operability + logical tab order; honor `prefers-reduced-motion`, `prefers-contrast`, `prefers-reduced-transparency`; min 44px touch targets; meaningful icons get `aria-label`; **live regions announce AI streaming completion and quiz/check results**.

**Wiring:** define all tokens as CSS vars in `globals.css` under `:root` and `[data-theme='dark']`; map semantics in `tailwind.config.ts theme.extend.{colors,boxShadow,borderRadius,fontFamily}`. Client `AccessibilityProvider` reads `profiles.prefs`, sets `<html>` attributes, persists changes via a server action.

---

## 3. Information architecture & route tree

Next.js 14 App Router. **Server Components are the default;** client components are leaf islands only (chat, quiz/flashcard runners, mindmap canvas, note editor, dropzone, realtime room, the entire accessibility layer, command palette). **Anthropic streaming lives in Node Route Handlers** (`export const runtime='nodejs'`, high `maxDuration`) — never Server Actions (they can't stream tokens). Non-streaming mutations (save note, FSRS grade, settings) use **Server Actions**. `middleware.ts` refreshes the Supabase session (`@supabase/ssr`) and gates `(app)`.

```
src/app/
  layout.tsx                  RSC root — SF Pro @font-face, <html> mode attrs, ThemeProvider + AccessibilityProvider (client islands), Supabase session bootstrap
  globals.css                 CSS vars (light + [data-theme='dark']), OpenDyslexic @font-face, focus-mode dimming, reduced-motion block
  middleware.ts               (project root) Supabase session refresh + (app) auth gate + rate-limit header pass-through
  not-found.tsx · error.tsx · loading.tsx

  (marketing)/                PUBLIC, ISR, no auth
    layout.tsx                floating pill nav (client for scroll state) + footer
    page.tsx                  landing — "The Page That Reads Back" (see §8)
    pricing/page.tsx
    manifesto/page.tsx        "active learning, not content delivery" thesis
    accessibility/page.tsx    secondary-market story (ADHD/dyslexia/colorblind/low-vision)
    (legal)/privacy|terms/page.tsx

  (auth)/                     UNAUTH ONLY → redirect to /dashboard if session
    layout.tsx                centered card, brand wordmark
    login/page.tsx            client form → server action (signInWithPassword / OAuth)
    signup/page.tsx
    callback/route.ts         OAuth code exchange → set cookies → redirect
    confirm/route.ts          email OTP / magic-link verify
    reset-password/page.tsx

  (app)/                      AUTHED workspace — gated in middleware + layout
    layout.tsx                RSC — fetch profile, pill nav, command-palette mount, focus-mode toggle, floating Accessibility pill
    dashboard/page.tsx        RSC — recent docs, due flashcards (FSRS), streak, "continue studying", Today's Move (analytics) — Suspense-streamed
    library/page.tsx          all sources grid (large rounded cards, soft shadow)
    upload/page.tsx           client dropzone + URL/GitHub/YouTube connectors

    documents/[docId]/
      layout.tsx              RSC — loads doc + sources, split-view shell (reader | tutor rail), tab bar
      page.tsx                reader (RSC streams chunks) + HighlightLayer + HoverMagnifier + DictionaryHover (clients)
      tutor/page.tsx          Socratic chat companion (client; streams /api/chat)
      quiz/page.tsx           adaptive quiz runner (client)
      flashcards/page.tsx     FSRS review session (client; grade → server action)
      mindmap/page.tsx        @xyflow/react concept-node canvas (client; streams /api/mindmap)
      notes/page.tsx          notebook editor (client; autosave server action)
      summary/page.tsx        Study Ladder (client; streams /api/summary)

    rooms/page.tsx            study rooms list (RSC)
    rooms/[roomId]/page.tsx   live room (client) — Supabase Realtime presence + shared companion
    analytics/page.tsx        Next Action Engine dashboard (RSC, server-aggregated; review drawer is client)
    settings/(profile|accessibility|billing)/page.tsx

src/app/api/                  Route Handlers (Node runtime for all streaming + parsers)
  chat/route.ts               Socratic tutor — RAG retrieve → stream, Sonnet/Opus routing, tool use
  companion/route.ts          live study-room shared tutor (Broadcast-fans one turn to members)
  explain/route.ts            hover "explain this span" micro-tutor (Haiku)
  mindmap/seed|grade|recall/route.ts   concept-graph seed (stream) + grade/recall (structured)
  quiz/generate|grade/route.ts
  flashcards/generate|grade|rescue/route.ts
  summary/route.ts            Study Ladder spine/bullets (stream + structured) + checkpoint grading
  notes/synthesize|link|grade|hint/route.ts
  highlights/annotate|grade/route.ts
  dictionary/route.ts         hover definition + distractors (Haiku, structured)
  register/render|recall/route.ts        communication-mode calibration + A/B
  analytics/move|items|adjudicate/route.ts
  ingest/route.ts             POST {sourceType} → create document+source rows, enqueue
  ingest/[jobId]/status/route.ts
  connectors/youtube|github|gdrive/route.ts
  storage/sign/route.ts       short-lived signed upload/download URLs
  cron/fsrs-due|cache-warm|analytics-decay|coach-weekly/route.ts   Vercel Cron

src/lib/
  anthropic.ts                shared client + model(tier) helper (EXISTS)
  env.ts                      typed env access (EXISTS)
  supabase/{client,server}.ts (EXISTS) + admin.ts (service role)
  rag/{embed,retrieve,rerank}.ts
  ingest/{pdf,docx,pptx,gdoc,image,code,youtube,github,chunk}.ts
  fsrs.ts                     ts-fsrs wrapper · sm2.ts  SM-2-lite scheduler
  schemas/                    zod schemas (quiz, flashcard, mindmap, summary, dictionary, …)
  ratelimit.ts                Upstash sliding-window quotas
  ai-usage.ts                 ai_usage ledger writer + cost computation
```

**Server vs client summary.** Server Components: all page shells, reader, dashboards, library, analytics (Supabase server client, RLS-scoped). Client Components: ThemeProvider, AccessibilityProvider + HoverMagnifier + DictionaryHover, chat/companion UIs, quiz/flashcard/summary runners, mindmap canvas, note editor, dropzone, realtime room, command palette. Route Handlers: **every** Anthropic call and every ingestion/embedding call — never from the browser. Server Actions: non-streaming mutations.

---

## 4. Supabase schema + RLS

One consolidated, runnable migration. Postgres + pgvector (HNSW cosine). **RLS enabled on every user-facing table** — owner-scoped via `auth.uid()`, with a membership path for rooms. Storage RLS keys objects to `{uid}/...`. Embedding width is **1536** (Voyage `voyage-3` / OpenAI `text-embedding-3-small`). Every chunk stores an exact-span `loc` (page/char/timestamp/slide/file-line) so citations land precisely. SM-2-lite spaced-repetition state lives on `flashcards` (FSRS) and on `concept_mastery` / `note_schedule` / `vocab_items` (SM-2).

```sql
-- =====================================================================
-- OpenBook — full Postgres schema (Supabase). Run in order.
-- =====================================================================
create extension if not exists "pgcrypto";
create extension if not exists vector;

-- ---------- enums ----------
create type source_kind  as enum ('pdf','docx','pptx','gdoc','image','code','notebook','markdown','youtube','github','text');
create type doc_status   as enum ('queued','parsing','chunking','embedding','ready','failed');
create type quiz_kind    as enum ('mcq','multi','true_false','short_answer','cloze','locate');
create type room_role    as enum ('host','member');
create type review_grade as enum ('again','hard','good','easy');   -- FSRS 1-4

-- ---------- profiles (1:1 with auth.users) ----------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  prefs        jsonb not null default '{
    "theme":"system","dyslexia":false,"focus":false,"cvd":"none",
    "lens":"off","reduce_motion":false,"line_spacing":"normal",
    "skip_socratic":false,"register":"casual"
  }'::jsonb,                                  -- accessibility + comms-mode prefs (the accommodation follows the student)
  plan         text not null default 'free',
  streak_days  int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create function handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- documents (a study workspace) ----------
create table documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  emoji       text,
  status      doc_status not null default 'queued',
  error       text,
  claude_file_id text,                        -- Files API id; reference for citations, never re-upload
  starter_questions jsonb not null default '[]'::jsonb,  -- Haiku-generated empty-state chips
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on documents (owner_id, updated_at desc);

-- ---------- sources (raw inputs attached to a document) ----------
create table sources (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  kind         source_kind not null,
  title        text,
  storage_path text,                          -- private bucket object path
  external_url text,                          -- youtube/github/gdoc url
  byte_size    bigint,
  status       doc_status not null default 'queued',
  meta         jsonb not null default '{}'::jsonb,  -- page count, repo sha, video id, ocr lang...
  created_at   timestamptz not null default now()
);
create index on sources (document_id);
create index on sources (owner_id);

-- ---------- chunks (+ pgvector) — RAG retrieval unit ----------
create table chunks (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references sources(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  ordinal       int  not null,
  content       text not null,
  token_count   int,
  loc           jsonb not null default '{}'::jsonb, -- {page,char_start,char_end,t_start_sec,t_end_sec,file_path,line_start,line_end,slide}
  fts           tsvector generated always as (to_tsvector('english', content)) stored,  -- hybrid re-rank
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);
create index on chunks (source_id, ordinal);
create index on chunks (document_id);
create index chunks_fts_idx on chunks using gin (fts);
create index chunks_embedding_hnsw on chunks
  using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);

-- RLS-safe vector search scoped to a document (security invoker => caller's RLS applies)
create function match_chunks(
  p_document_id uuid, p_query vector(1536), p_match_count int default 8
) returns table (id uuid, source_id uuid, content text, loc jsonb, similarity float)
language sql stable security invoker as $$
  select c.id, c.source_id, c.content, c.loc, 1 - (c.embedding <=> p_query) as similarity
  from chunks c
  where c.document_id = p_document_id
  order by c.embedding <=> p_query
  limit p_match_count;
$$;

-- ---------- concepts (nodes of the per-document concept map) ----------
create table concepts (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references concepts(id) on delete set null,
  label       text not null,
  summary     text,
  source_chunk_ids uuid[] not null default '{}',  -- for item generation
  prereq_concept_ids uuid[] not null default '{}', -- DAG for fan-out weighting / analytics
  graph_x     real, graph_y real,
  exam_date   date,
  created_at  timestamptz not null default now()
);
create index on concepts (document_id, owner_id);

-- per-concept spaced-repetition + mastery (SM-2 + half-life), drives rings, branching, analytics
create table concept_mastery (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  concept_id    uuid not null references concepts(id) on delete cascade,
  mastery       numeric not null default 0,        -- 0..1, Bayesian posterior / Elo
  alpha numeric not null default 1, beta numeric not null default 1,
  state         text not null default 'weak',      -- weak|shaky|solid
  ease          numeric not null default 2.5,
  interval_days int not null default 0,
  reps          int not null default 0,
  half_life_hours numeric,
  recall_prob_now numeric,                          -- cached: 2^(-hrs_since/half_life)
  last_reviewed timestamptz,
  next_review   timestamptz,
  updated_at    timestamptz not null default now(),
  unique (owner_id, concept_id)
);
create index on concept_mastery (owner_id, next_review);

-- ---------- highlights ----------
create table highlights (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  document_id  uuid not null references documents(id) on delete cascade,
  source_id    uuid references sources(id) on delete cascade,
  chunk_id     uuid references chunks(id) on delete set null,
  color        text not null default 'accent',
  loc          jsonb not null,                 -- exact span (+ ~280-char context window stored in meta)
  quote        text not null,
  margin_note  text,
  annotation   text,                           -- Haiku 1-liner "why this matters"
  recall_question text,                         -- Haiku-generated; answer is the highlight itself
  triage       text not null default 'inbox',  -- inbox|got_it|confused|forged|dismissed
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index on highlights (document_id, owner_id);

-- ---------- notes (concept-graph notebook) ----------
create table notes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  title         text,
  body_student  text,                          -- the student's own articulation (proof of authorship)
  body_synth    text,                          -- Claude-refined, student-accepted
  retrieval_prompt text,
  origin_highlight_id uuid references highlights(id) on delete set null,
  embedding     vector(1536),                  -- link-candidate pre-filter
  x real, y real,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on notes (document_id, owner_id);
create index notes_embedding_hnsw on notes using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);

create table note_keypoints (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references notes(id) on delete cascade,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  text      text not null,
  order_idx int not null default 0
);
create index on note_keypoints (note_id);

create table note_links (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  source_note_id uuid not null references notes(id) on delete cascade,
  target_note_id uuid not null references notes(id) on delete cascade,
  relation      text not null,                 -- relates_to|contradicts|example_of|prerequisite_of
  rationale     text,
  status        text not null default 'suggested', -- suggested|confirmed|rejected
  created_at    timestamptz not null default now(),
  unique (source_note_id, target_note_id, relation)
);
create index on note_links (document_id, owner_id);

create table note_schedule (                    -- SM-2 per note (Quick Recall)
  note_id        uuid primary key references notes(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  next_review_at timestamptz not null default now(),
  interval_days  int not null default 0,
  ease           numeric not null default 2.5,
  last_reviewed_at timestamptz
);
create index on note_schedule (owner_id, next_review_at);

-- ---------- quizzes ----------
create table quizzes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  scope       text not null default 'whole_doc',  -- whole_doc|chapter|concept_set
  scope_ref   jsonb not null default '{}'::jsonb,
  status      text not null default 'calibrating', -- calibrating|active|completed|abandoned
  score       numeric,
  started_at  timestamptz not null default now(),
  completed_at timestamptz
);
create table quiz_items (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  concept_id  uuid references concepts(id) on delete set null,
  chunk_id    uuid references chunks(id) on delete set null,
  kind        quiz_kind not null,
  stem        text not null,
  options     jsonb,                            -- [{id,text}]
  correct     jsonb not null,
  supporting_span jsonb not null default '{}'::jsonb, -- {chunk_id,char_start,char_end} (unresolvable => dropped server-side)
  target_misconception text,
  explanation text,
  difficulty  smallint not null default 3,
  is_followup boolean not null default false,
  interleave_after smallint,
  ordinal     int not null default 0,
  model       text
);
create index on quiz_items (quiz_id, ordinal);
create table quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  quiz_item_id uuid not null references quiz_items(id) on delete cascade,
  answer      jsonb,
  confidence  smallint,                         -- 0 guessing, 1 unsure, 2 confident
  is_correct  boolean,
  partial_credit numeric,
  misconception_label text,
  ai_feedback text,
  latency_ms  int,
  repaired    boolean not null default false,   -- took the 10-sec micro-retry & got it
  created_at  timestamptz not null default now()
);
create index on quiz_attempts (owner_id, quiz_item_id);

-- ---------- flashcards (FSRS) ----------
create table decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  title       text not null,
  description text,
  card_count  int not null default 0,
  retention_pct numeric,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table flashcards (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  deck_id      uuid not null references decks(id) on delete cascade,
  document_id  uuid references documents(id) on delete set null,
  card_type    text not null default 'qa',      -- cloze|qa|term_def|visual
  front        text not null,
  back         text not null,
  cloze_text   text,
  citations    jsonb not null default '[]'::jsonb,
  source_chunk_id uuid references chunks(id) on delete set null,
  origin       text not null default 'ai_generated', -- ai_generated|quiz_miss|highlight|manual|rescue_subcard
  parent_card_id uuid references flashcards(id) on delete set null, -- laddered rescue sub-cards
  -- FSRS state (ts-fsrs)
  fsrs_state   text not null default 'new',      -- new|learning|review|relearning
  due          timestamptz not null default now(),
  stability    double precision not null default 0,
  difficulty   double precision not null default 0,
  reps         int not null default 0,
  lapses       int not null default 0,
  last_review  timestamptz,
  is_leech     boolean not null default false,
  is_suspended boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on flashcards (owner_id, due);      -- "due cards" is the hot query
create index on flashcards (deck_id);
create table flashcard_reviews (                 -- immutable log → analytics + FSRS optimizer + calibration
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  session_id   uuid,
  grade        review_grade not null,
  predicted_confidence smallint,                  -- self-rating before reveal (calibration)
  recall_mode  text not null default 'typed',     -- typed|self_graded
  typed_answer text,
  ai_verdict   text,                              -- correct|partial|incorrect
  ai_suggested_grade smallint,
  reveal_latency_ms int,
  elapsed_ms   int,
  prev_due     timestamptz, next_due timestamptz,
  prev_stability double precision,
  reviewed_at  timestamptz not null default now()
);
create index on flashcard_reviews (owner_id, reviewed_at desc);
create table card_seeds (                         -- proven weak spots (quiz misses, highlights)
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  deck_id     uuid references decks(id) on delete cascade,
  seed_type   text not null,                      -- quiz_miss|highlight|note
  source_quiz_item_id uuid references quiz_items(id) on delete set null,
  source_chunk_id uuid references chunks(id) on delete set null,
  content     text,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on card_seeds (owner_id, consumed);
create table rescue_artifacts (                   -- persisted leech re-teaching (reusable, not re-billed)
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  diagnosis   text, explanation text, mnemonic text,
  generated_subcard_ids uuid[],
  model       text not null default 'claude-opus-4-8',
  created_at  timestamptz not null default now()
);

-- ---------- mindmaps (connected concept nodes, student-grown) ----------
create table mind_maps (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  title         text,
  central_topic text,
  source_checksum text,                          -- invalidate anchors/cache if doc changes
  seed_model    text,
  layout        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table source_anchors (                     -- hidden grading ground-truth from SEED pass
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references mind_maps(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  quote       text not null,
  char_start  int, char_end int,
  embedding   vector(1536)
);
create index source_anchors_embedding_hnsw on source_anchors using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create table mind_map_nodes (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references mind_maps(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references mind_map_nodes(id) on delete set null,
  label       text,                              -- student-authored
  canonical_text text,                            -- Claude's precise phrasing (null until graded)
  kind        text not null default 'concept',    -- central|concept|subconcept
  status      text not null default 'ghost',      -- ghost|unverified|confirmed|partial|off_source|misconception
  authored_by text not null default 'student',    -- claude_seed|student
  source_anchor_id uuid references source_anchors(id) on delete set null,
  x real, y real,
  created_at  timestamptz not null default now()
);
create index on mind_map_nodes (map_id);
create table mind_map_edges (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references mind_maps(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  source_node_id uuid not null references mind_map_nodes(id) on delete cascade,
  target_node_id uuid not null references mind_map_nodes(id) on delete cascade,
  relation    text not null,                      -- causes|is_part_of|contrasts_with|depends_on|example_of|leads_to
  status      text not null default 'unverified', -- unverified|confirmed|partial|invalid
  student_defense text,                            -- Socratic one-liner answer
  created_at  timestamptz not null default now()
);
create table node_reviews (                        -- SM-2 per node
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references mind_map_nodes(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  ease        real not null default 2.5,
  interval_days int not null default 0,
  due_at      timestamptz,
  last_grade  text,                               -- again|hard|good|easy
  reps        int not null default 0,
  last_recalled_at timestamptz
);
create index on node_reviews (owner_id, due_at);

-- ---------- summary "Study Ladder" ----------
create table summaries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  thesis      text,
  spine       jsonb not null default '{"nodes":[],"edges":[]}'::jsonb, -- key-idea nodes + bullets + source chips
  teach_back  text,                               -- student's own end-of-ladder summary (the saved artifact)
  created_at  timestamptz not null default now()
);

-- ---------- dictionary-on-hover vocab deck ----------
create table lookups (                             -- raw hover event log
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  chunk_id    uuid references chunks(id) on delete set null,
  word text, lemma text, char_start int, char_end int,
  sentence_text text, contextual_definition text, plain_gloss text,
  sense_tag text, pos text, difficulty text,
  guessed boolean, guess_correct boolean,
  created_at  timestamptz not null default now()
);
create table vocab_items (                         -- SM-2-lite vocab deck
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  lemma text, sense_tag text,
  first_seen_document_id uuid references documents(id) on delete set null,
  example_sentence text, plain_gloss text,
  ease_factor numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  due_at timestamptz, last_reviewed_at timestamptz,
  mastered boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, lemma, sense_tag)
);
create table definition_cache (                    -- dedupe common words across users on public docs
  id          uuid primary key default gen_random_uuid(),
  lemma text, sense_hash text, context_fingerprint text,
  payload jsonb, model text, hit_count int not null default 0,
  created_at  timestamptz not null default now(),
  unique (lemma, context_fingerprint)
);

-- ---------- communication mode (persisted voice register) ----------
create table communication_registers (            -- seeded reference data (NOT user-scoped; no RLS owner col)
  id text primary key,                             -- 'formal'|'casual'|'gen_z'|'gen_alpha'
  display_name text, emoji text,
  style_block_md text,                             -- the cached system-prompt style prefix (load-bearing)
  reading_level text, max_sentence_words int,
  version int not null default 1, is_active boolean not null default true
);
create table user_communication_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_register_id text references communication_registers(id),
  calibrated_at timestamptz, locked boolean not null default false,
  ab_winner_register_id text references communication_registers(id),
  ab_completed boolean not null default false,
  global_override boolean not null default true,
  updated_at timestamptz not null default now()
);
create table register_recall_events (             -- authoritative A/B ledger
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid references concepts(id) on delete set null,
  register_id text references communication_registers(id),
  prompt_phrasing_register text,
  correct boolean, gist_match_score numeric, latency_ms int, reexplain_count int,
  source text,                                     -- calibration|stress_test|ab_test|in_feature|register_flip
  created_at timestamptz not null default now()
);
create index on register_recall_events (owner_id, register_id, created_at);

-- ---------- study sessions / chat / analytics / rooms / usage ----------
create table study_sessions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  document_id  uuid references documents(id) on delete cascade,
  room_id      uuid,
  mode         text not null,                     -- tutor|quiz|flashcards|read|mindmap|summary|notes
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  focus_seconds int not null default 0,           -- ADHD focus time on task
  calibration_score numeric,
  meta         jsonb not null default '{}'::jsonb
);
create index on study_sessions (owner_id, started_at desc);

create table chat_messages (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references study_sessions(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  role         text not null,                     -- user|assistant|check|system
  content      text not null,
  intent       text,                              -- factual|conceptual|problem|off_material|meta
  stance       text,
  retrieval_confidence real,
  citations    jsonb not null default '[]'::jsonb, -- [{label,chunk_id,page,char_start,char_end,quoted_text}]
  tokens_in int, tokens_out int, cache_read int, model text,
  created_at   timestamptz not null default now()
);
create index on chat_messages (session_id, created_at);

-- understanding-checks (the retention engine for the tutor)
create table understanding_checks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  message_id  uuid references chat_messages(id) on delete cascade,
  concept_id  uuid references concepts(id) on delete set null,
  chunk_id    uuid references chunks(id) on delete set null,
  check_type  text not null,                      -- free_response|mcq
  prompt text, options jsonb, model_answer text,
  student_response text,
  verdict text,                                    -- correct|partial|misconception
  gap text, reexplanation text,
  created_at  timestamptz not null default now()
);
create index on understanding_checks (owner_id, created_at desc);

create table analytics_events (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  document_id  uuid references documents(id) on delete set null,
  name         text not null,                     -- 'card_reviewed','quiz_completed','span_explained','focus_started'...
  props        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index on analytics_events (owner_id, created_at desc);
create index on analytics_events (name, created_at desc);

create table daily_moves (                         -- analytics "Today's Move" forced-decision card
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  concept_id  uuid references concepts(id) on delete set null,
  rank        smallint, rationale text, urgency_label text, modality text,
  est_minutes smallint,
  status      text not null default 'pending',     -- pending|started|completed|snoozed
  snooze_reason text,                              -- already_know|no_time|too_hard
  recall_prob_at_creation numeric,
  generated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on daily_moves (owner_id, generated_at desc);
create table calibration_weekly (                  -- weekly Opus coaching synthesis
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  week_start date,
  brier_score numeric, overconfidence_bias numeric,
  topic_biases jsonb, coaching_note text,
  scheduling_weight_adjustments jsonb,
  created_at  timestamptz not null default now()
);

create table study_rooms (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  name        text not null,
  is_public   boolean not null default false,
  invite_code text unique default encode(gen_random_bytes(6),'hex'),
  created_at  timestamptz not null default now()
);
create index on study_rooms (host_id);
create table study_room_members (
  room_id uuid not null references study_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    room_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table ai_usage (                            -- cost + abuse ledger (service-role writes only)
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  route        text not null, model text not null,
  input_tokens int, output_tokens int, cache_read int, cache_creation int,
  cost_usd     numeric(10,6),
  created_at   timestamptz not null default now()
);
create index on ai_usage (owner_id, created_at desc);

-- =====================================================================
-- ROW LEVEL SECURITY — owner-scoped everywhere; rooms add a membership path
-- =====================================================================
alter table profiles            enable row level security;
alter table documents           enable row level security;
alter table sources             enable row level security;
alter table chunks              enable row level security;
alter table concepts            enable row level security;
alter table concept_mastery     enable row level security;
alter table highlights          enable row level security;
alter table notes               enable row level security;
alter table note_keypoints      enable row level security;
alter table note_links          enable row level security;
alter table note_schedule       enable row level security;
alter table quizzes             enable row level security;
alter table quiz_items          enable row level security;
alter table quiz_attempts       enable row level security;
alter table decks               enable row level security;
alter table flashcards          enable row level security;
alter table flashcard_reviews   enable row level security;
alter table card_seeds          enable row level security;
alter table rescue_artifacts    enable row level security;
alter table mind_maps           enable row level security;
alter table source_anchors      enable row level security;
alter table mind_map_nodes      enable row level security;
alter table mind_map_edges      enable row level security;
alter table node_reviews        enable row level security;
alter table summaries           enable row level security;
alter table lookups             enable row level security;
alter table vocab_items         enable row level security;
alter table user_communication_prefs enable row level security;
alter table register_recall_events   enable row level security;
alter table study_sessions      enable row level security;
alter table chat_messages       enable row level security;
alter table understanding_checks enable row level security;
alter table analytics_events    enable row level security;
alter table daily_moves         enable row level security;
alter table calibration_weekly  enable row level security;
alter table study_rooms         enable row level security;
alter table study_room_members  enable row level security;
alter table ai_usage            enable row level security;

-- profiles + comms prefs: self only
create policy "profiles_self" on profiles for all using (id=auth.uid()) with check (id=auth.uid());
create policy "comm_prefs_self" on user_communication_prefs for all using (user_id=auth.uid()) with check (user_id=auth.uid());

-- generic owner-scoped tables (one policy each)
create policy "own_documents"  on documents        for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_sources"    on sources          for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_chunks"     on chunks           for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_concepts"   on concepts         for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_cmastery"   on concept_mastery  for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_highlights" on highlights       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_notes"      on notes            for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_keypoints"  on note_keypoints   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_notelinks"  on note_links       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_notesched"  on note_schedule    for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_quizzes"    on quizzes          for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_quizitems"  on quiz_items       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_attempts"   on quiz_attempts    for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_decks"      on decks            for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_cards"      on flashcards       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_reviews"    on flashcard_reviews for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_seeds"      on card_seeds       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_rescue"     on rescue_artifacts for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_maps"       on mind_maps        for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_anchors"    on source_anchors   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_nodes"      on mind_map_nodes   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_edges"      on mind_map_edges   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_noderev"    on node_reviews     for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_summaries"  on summaries        for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_lookups"    on lookups          for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_vocab"      on vocab_items      for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_regevents"  on register_recall_events for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_sessions"   on study_sessions   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_chat"       on chat_messages    for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_checks"     on understanding_checks for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_events"     on analytics_events for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_moves"      on daily_moves      for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_calib"      on calibration_weekly for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_usage"      on ai_usage         for select using (owner_id=auth.uid());  -- writes via service role only

-- communication_registers: read-only reference data for all authed users
create policy "registers_read" on communication_registers for select using (auth.role() = 'authenticated');

-- study rooms: host manages; members + public read
create policy "rooms_select" on study_rooms for select
  using (is_public or host_id=auth.uid()
         or exists (select 1 from study_room_members m where m.room_id=study_rooms.id and m.user_id=auth.uid()));
create policy "rooms_host_write" on study_rooms for all using (host_id=auth.uid()) with check (host_id=auth.uid());
create policy "members_self" on study_room_members for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "members_host_read" on study_room_members for select
  using (exists (select 1 from study_rooms r where r.id=room_id and r.host_id=auth.uid()));

-- =====================================================================
-- STORAGE (private bucket) — RLS keys objects to {uid}/...
-- =====================================================================
insert into storage.buckets (id,name,public) values ('sources','sources',false) on conflict do nothing;
create policy "storage_own_read"  on storage.objects for select
  using (bucket_id='sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage_own_write" on storage.objects for insert
  with check (bucket_id='sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage_own_del"   on storage.objects for delete
  using (bucket_id='sources' and (storage.foldername(name))[1] = auth.uid()::text);
```

**RLS notes.**
- Every user-facing table is owner-scoped via a single `for all` policy on `owner_id = auth.uid()` (with check on the same), so RAG, highlights, scheduling, etc. are safe by construction. `match_chunks` is `security invoker` so caller RLS applies even though it's an RPC.
- `ai_usage` is **select-only** for owners; all writes come from server-side service-role inserts (`src/lib/supabase/admin.ts`), so usage can't be tampered with client-side.
- `communication_registers` is non-user reference data → read-only to authenticated users; seed/edit via service role.
- Study rooms add a **membership path** (public OR host OR member) and a host-read policy for the member list. Realtime Authorization enforces the same room RLS on the WebSocket.
- Storage signed upload/download URLs (≤500MB) bypass the function so big files don't pass through the route; objects live at `{uid}/{docId}/file`.

---

## 5. Anthropic / Claude integration & model routing

**SDK** `@anthropic-ai/sdk@0.102`, called **only** from Node Route Handlers / Server Actions via the shared `src/lib/anthropic.ts` client (key never reaches the browser). **Model IDs are pinned** and exact: Opus 4.8 `claude-opus-4-8`, Sonnet 4.6 `claude-sonnet-4-6`, Haiku 4.5 `claude-haiku-4-5`. The repo already exposes `model('fast'|'balanced'|'deep')`.

### 5.1 The non-negotiable 4.x request surface
- **Thinking is adaptive-only.** Use `thinking:{type:'adaptive'}`. **Never** send `budget_tokens` / `temperature` / `top_p` / `top_k` on Opus 4.8 / Sonnet 4.6 / Haiku 4.5 — they return **400**.
- **Depth via effort:** `output_config:{effort:'low'|'medium'|'high'|'max'}`. `max` is Opus-tier only; default is `high`. Haiku/Sonnet support `low|medium|high`. Use `effort:'high'` (or `'xhigh'`/`'max'` on Opus) for hard reasoning; `low` for the cheap, latency-critical calls.
- **Thinking text is omitted by default** on 4.8 — set `thinking:{type:'adaptive',display:'summarized'}` if you stream reasoning to the user; otherwise leave it omitted.
- **Last-assistant-turn prefills 400.** Use structured outputs or a system instruction instead of prefilling.

### 5.2 Streaming
All streaming handlers run on **Node** (`export const runtime='nodejs'`, high `maxDuration`) because they also touch Supabase service-role and Node parsers, and we want one auth/cache path. Pattern: bridge `client.messages.stream({...})` events (`text_delta`, `thinking_delta`) into an SSE `ReadableStream`; the client reads with `fetch` reader / `EventSource`. Use `.finalMessage()` server-side to capture usage and persist the assistant turn + token counts. **Always stream long output** (prevents request timeouts); Opus/Sonnet/Haiku support up to 64K (Sonnet/Haiku) / 128K (Opus) output with streaming. Set a 2px lime caret pulsing while generating (removed on stop).

### 5.3 Structured outputs
Quiz/flashcard/mindmap/summary/dictionary/router generation uses `output_config:{format:{type:'json_schema',schema:…}}` (or `client.messages.parse()` with `zodOutputFormat` — **zod is already a dep**). Schemas live once in `src/lib/schemas/` and validate client + server, so malformed objects never reach Postgres. **Constraint the spec depends on:** structured outputs are **incompatible with Files-API citations on the same call** — anything that needs both (Summary anchoring, tutor cited answers vs. structured checks) runs as **two passes** (see §7).

### 5.4 Tool use (manual agentic loop)
The tutor exposes RLS-scoped app tools — `retrieve_more_context(query)` (re-runs `match_chunks`), `generate_quiz(topic,n)`, `make_flashcards(concept)`, `show_citation(chunk_id)`. Use the **manual loop** in the Route Handler so we control RLS-scoped execution, log every call to `ai_usage`, and gate side-effecting tools. Tool input is always `JSON.parse`'d (never string-matched — 4.x may escape Unicode/slashes). Tool order is deterministic to keep the cache prefix byte-stable.

### 5.5 Files API + citations
Documents upload once at ingest → `documents.claude_file_id`; we reference by `file_id` and never re-upload. Cited answers send the document as a `document` content block with `citations:{enabled:true}` (`files-api-2025-04-14`), so Claude emits citation blocks bound to exact char spans → map to `[1]` pills, no homegrown quote-finding. **No citation = the model is instructed to say "I can't find this in your material"** rather than hallucinate.

### 5.6 Prompt caching
Place the **frozen system prompt + per-document context before the volatile turn**, with `cache_control:{type:'ephemeral'}` on the last stable block. System prompts are **frozen** (no timestamps/UUIDs interpolated — dynamic state injected as later message content, or via mid-conversation `role:"system"` messages with beta `mid-conversation-system-2026-04-07`). A long tutoring session over one document pays the big context once and reads it at ~0.1×. Verify with `usage.cache_read_input_tokens`. **Minimum cacheable prefix is 4096 tokens on Opus & Haiku, 2048 on Sonnet** — so for Haiku surfaces (dictionary) cache `[frozen system + passage chunk]` together to clear the floor. `/api/cron/cache-warm` pre-warms hot docs with a `max_tokens:0` prefill so the first real turn is fast.

### 5.7 Model routing (cheapest model that clears the bar)
| Tier | Model | Tasks |
|---|---|---|
| `fast` | `claude-haiku-4-5` | hover "explain this span", dictionary definition+distractors, flashcard Q/A pairs, free-text recall grading (notes/highlights/flashcards), OCR/vision transcription, note autocomplete, mindmap node-grade (default), analytics "Today's Move" copy + self-grade adjudication, question classification/router, highlight annotation+recall-question. |
| `balanced` | `claude-sonnet-4-6` | default Socratic tutor chat, quiz generation + free-text grading w/ feedback, study-guide planning, mindmap socratic + recall scoring, flashcard generation, note synthesis pass, summary checkpoint+teach-back grading, communication-mode multi-register render, analytics retrieval-practice item generation, highlight answer grading, quiz free-text grade. |
| `deep` | `claude-opus-4-8` | hard multi-source reasoning, "explain why I got this wrong across the whole doc", summary spine + Layer-0/1 generation + citation anchoring (two passes), quiz **question generation** (diagnostic distractors), flashcard **leech rescue**, weekly analytics coaching synthesis. Run at `effort:'high'`/`'xhigh'`. |

**Router:** a small heuristic on task type + estimated difficulty + the user's recent error rate picks the model; **escalate Sonnet→Opus on low confidence or explicit "I still don't get it."** A retrieval-quality gate (Haiku, structured) returns `retrieval_confidence`; `<0.4` short-circuits to an honest "not in your material" instead of guessing.

### 5.8 Cost & abuse controls
Every call logs to `ai_usage` (input/output/cache tokens + computed cost via `src/lib/ai-usage.ts`). Per-user/plan quotas enforced **before** the call (token + request budgets via **Upstash sliding window** keyed on `auth.uid`); `429 + retry-after` when exceeded (handle the typed `RateLimitError`). Non-latency-sensitive bulk jobs (generate flashcards for a whole library, batch-grade) use the **Message Batches API at 50%**. Free tier defaults to Haiku/Sonnet + low effort; **Opus gated to paid.** SDK auto-retries 429/5xx with backoff. `count_tokens` guards budget before expensive calls; oversized context is chunked/summarized **with user notice, never silently truncated.**

---

## 6. Ingestion + RAG pipeline

### 6.1 One pipeline: parse → normalize → chunk → embed → store (Node)
| Input | Library | Notes |
|---|---|---|
| PDF | `unpdf` / `pdf-parse` | Vision fallback via Claude Files API for scanned pages. |
| Word | `mammoth` | |
| PowerPoint | `officeparser` | slide `loc`. |
| Google Docs | Drive `files.export` | OAuth Google grant. |
| Image / OCR | `tesseract.js` + Claude vision | `ocr_lang` in `sources.meta`. |
| Code / `.ipynb` / `.md` | `remark` / Tree-sitter | function-boundary splitting; file-line `loc`. |
| YouTube | `youtube-transcript` / `youtubei.js` | Whisper fallback; timestamp `loc`. |
| GitHub | Octokit tree + blobs | allowlist; repo sha in meta. |

Chunks are **structure-aware** (~500–800 tokens, ~100 overlap, never crossing a section). Every chunk stores exact-span `loc` so citations land precisely. Embeddings batch to **Voyage `voyage-3`** (OpenAI `text-embedding-3-small` fallback, same 1536 width — `voyageai` + `openai` deps). At ingest, also generate `documents.starter_questions` (Haiku) for the tutor empty state, upload to Files API → `claude_file_id`, and seed `concepts` (the per-document concept graph the quiz/mindmap/analytics features reuse).

**Progress** streams to the UI via **Supabase Realtime on `documents.status`** (`queued→parsing→chunking→embedding→ready|failed`). Heavy work is backgrounded; `/api/ingest` returns a job id; the UI subscribes to status (or polls `/api/ingest/[jobId]/status`).

### 6.2 RAG + citations
Query embedded (asymmetric query mode) → `match_chunks` RPC (RLS-safe, scoped to the document) → **hybrid re-rank** (cosine + Postgres full-text `fts` for exact terms; optional `rerank-2`) → top-6 context block tagged with `chunk_id`/`loc`. The model returns a structured `cite` array (or Files-API citation blocks); the UI resolves `chunk_id → loc` and **scrolls the reader to the exact span / PDF page / slide / code line / YouTube timestamp**. Highlights reuse the same span-resolution path. Retrieval feeds a **Socratic tutor, not a summarizer.**

---

## 7. The 10 MVP features

Every feature obeys the product law (Claude coaches, student authors), reuses the per-document **`concepts`** graph + **mastery rings**, and ships the four accessibility modes. Common UI DNA: calm editorial canvas, floating pill nav, large rounded soft-shadow cards, **one lime accent per view**, both light/dark.

### 7.1 Q&A — Chat with your material (Socratic, citation-grounded)
**Loop (every turn is a retrieval-practice rep):** ① **Ask** — question embedded → `match_chunks` top-6 with source coords (empty state offers 4 Haiku starter chips). ② **Diagnose + route** (Haiku, ~300ms, structured `{intent, needs_socratic, retrieval_confidence, suggested_stance}`) decides the tutor's stance. ③ **Socratic answer** (Opus, streaming, `effort:'high'`): for conceptual/problem it **leads with a probe** ("Before I answer — what do you think happens…?") plus a quiet "Skip to answer" ghost link (ADHD-respecting, never a forced gate); for factual-recall it answers directly, every claim followed by an inline `[1]` pill that opens the cited passage in the right rail with the sentence highlighted. ④ **Understanding-check** (the retention engine): one inline free-response or 1-tap MCQ from the same passage, graded by Sonnet (`correct|partial|misconception` + the specific gap + targeted follow-up); a wrong answer **re-explains the exact misconception and re-asks**, closing on understanding not on giving up. ⑤ **Log + schedule** — result writes to `understanding_checks` + updates `concept_mastery` (SM-2); wrong concepts resurface on the dashboard as spaced review.

**UI:** three-pane. LEFT (240px, collapsible): document switcher + connected concept-node map; nodes glow their mastery ring as checks log; clicking a node filters chat to that concept. CENTER (`max-w-3xl`): editorial message column (no chat-app cramping), subtle `[1]` pills; the check renders as a distinct rounded card with a hairline lime left-border and a black pill Submit. RIGHT (360px): source rail slides in on citation hover/tap, exact sentence in a soft green wash, page/section breadcrumb, "open full document." States: EMPTY teaches the promise ("I'll show you where the answer lives and check that it stuck"); LOADING streams tokens immediately (TTFT <1s) with a dotted-halftone shimmer router line; ERROR on retrieval-miss → honest opt-in card "answer from general knowledge instead?", on stream error → "Reconnecting…" preserving partial response + retry pill, rate-limit → typed `RateLimitError` "High demand, retrying."

**Claude:** Haiku router + retrieval gate (structured; `<0.4` → "not in your material"); Opus streaming tutor with the **document block as a 1h-cached prefix**, stance/intent injected as a mid-conversation `role:"system"` message so per-turn routing never invalidates the cached system+document prefix; Sonnet check generator + grader (strict schema). Files-API citations and structured `output_config.format` **never on the same call** — the cited tutor turn is one call (citations on), the check generation/grading is a separate strict-schema call.

**Data:** `study_sessions` (mode `tutor`), `chat_messages` (+ `citations` jsonb = the `[1]`→rail map), `understanding_checks`, `concept_mastery`. **Accessibility:** ARIA-live on the streaming region; one-question-at-a-time check; `prefers-reduced-motion` disables spring/pulse; colorblind verdicts pair color with icon+label (`✓`/`◐`/`↻`); magnifier works in the dense source rail. **Differentiator:** competitors answer your question; OpenBook turns your question into a **graded memory** wired into the concept map and review schedule.

### 7.2 Summary — the "Study Ladder" (progressive, recall-gated)
**Loop (one rung at a time, never the whole summary at once):** ① **Orient (Layer 0)** — a single tight-tracked thesis + a concept spine of 5–9 connected nodes; everything below collapsed (advance-organizer effect). ② **Predict-before-reveal** — to expand a node the student must commit ("I think I know this" / a 1-tap prediction for high-yield nodes); bullets render only after the commitment (generation effect). ③ **Reveal + self-explain (Layer 1)** — bullets stream in, each with a source chip ("p.4 ¶2") + a Got it/Shaky/Lost confidence toggle; Shaky/Lost pulled forward and queued. ④ **Deep-dive on demand (Layer 2)** — lazy per-bullet tighter explanation + analogy + verbatim source excerpt (cost-right and pedagogically right). ⑤ **Checkpoint** — after every ~3 ideas a blocking gate of 2–3 free-recall/cloze questions weighted to Shaky/Lost, graded against source with targeted feedback; a miss resurfaces that node next session. ⑥ **Consolidate** — spine redraws colored by mastery (lime reserved for "review next"); a 20-second teach-back the student writes is graded for coverage and **saved as their artifact**.

**UI:** floating pill nav over calm canvas with faint halftone in gutters; the thesis is a large tight-tracked black headline; the spine is rounded node cards joined by thin curved edges (vertical mobile / branching desktop). Slim left progress rail with the lime "review next" item glowing. Node tap expands in place (springy 220ms accordion) into bullet cards (source chip pill, 3-state confidence segmented control, chevron to Layer 2). Checkpoint rises as a glassmorphic modal-sheet that dims behind (doubles as ADHD focus). EMPTY = dotted-outline drop card with a ghost spine behind it. LOADING = thesis streams token-by-token, then node cards pop in one at a time (watch the map build). ERRORS: unreadable PDF → "We couldn't read 3 pages — Retry with OCR?"; ungroundable bullet → muted "unverified" chip (**never a fake page number**); grading 529 → let the student through with "we'll re-check this later."

**Claude:** Opus streaming + structured for spine/Layer-0/1 (`effort:'high'`) — **two passes** because citations and `output_config.format` can't coexist: pass 1 = structured spine/bullets, pass 2 = a citations-enabled call mapping each bullet to exact source spans (both cacheable on the document prefix). Haiku for lazy Layer-2 deep-dives and checkpoint-question generation (reuse cached prefix). Sonnet for checkpoint + teach-back grading (coverage against `expected_points`, never phrasing — protects dyslexic/ADHD recall). **Data:** `summaries` (thesis, spine jsonb, teach_back), `concept_mastery`. **Differentiator:** source-anchored progressive disclosure gated by recall — you can't fully unlock the summary without proving recall, and every point is one tap from the verbatim source line (real Claude citations, never hallucinated).

### 7.3 Quizzes — adaptive diagnostic engine (miss → source → flashcard → spaced re-quiz)
**Loop:** ① **Calibration** — "Diagnose me" serves a 5-question spread, one per concept, no score shown ("Let's find your edges"). ② **Attempt with prediction** — before answering, a confidence slider (Guessing/Unsure/Confident); confident-wrong = misconception (high priority), unsure-right = fragile. Item types: MCQ, multi-select, short free-text (Claude-graded), "locate it" (highlight the supporting sentence). ③ **Immediate adaptive feedback** — card flips; wrong/fragile streams a targeted explanation that names the misconception, contrasts chosen vs correct, shows the exact source passage highlighted with "jump to source," and offers a 10-sec reworded "try the repair." ④ **Adaptive branching** — server re-weights (Elo/BKT, no LLM); missed concepts trigger 1–2 interleaved follow-ups later; mastered ones drop; concept rail shifts weak→shaky→solid. ⑤ **Miss → flashcard** — every wrong/fragile item auto-creates a flashcard (front = reworded prompt, back = explanation+cite) into the FSRS deck. ⑥ **Debrief = diagnosis** — per-concept mastery bars, top-2 misconceptions in plain language, "N flashcards created," and "Re-quiz weak concepts in 2 days" (writes a due date). Score shown small.

**UI:** one big rounded card (~720px), tight-tracked stem, large tappable option rows, the confidence slider below; right rail = the live concept map (single lime = current node); top pill shows **concept coverage** ("4 of 7 concepts probed"), not "Q3/10". Feedback replaces option rows in place. Micro: card flip on submit (spring ~280ms); single restrained green check (no confetti); flashcard peels off into a "Deck +1" pill. EMPTY = "Building your concept map…" skeleton wiring up, with a "Quiz the whole document" fallback. LOADING = shimmer skeleton (never a spinner); explanation streams with a caret. ERROR = generation fail → Retry pill + "use a different chapter"; grading timeout → show model answer + source, still create the card ("graded offline"); network drop → answers persisted per-item, resume exactly.

**Claude:** Opus **question generation** (structured, cached per-doc prefix) — distractors must each map to a **named misconception** and cite an exact supporting span by chunk offset (items with unresolvable spans dropped server-side). Sonnet **free-text grading + explanation** (streamed; a `grade_and_explain` tool returns `{is_correct, partial_credit, misconception_label, flashcard_front, flashcard_back}` while prose streams). **Next-item selection is pure server logic, no LLM.** **Data:** `quizzes`, `quiz_items`, `quiz_attempts`, `concept_mastery`, `flashcards`/`card_seeds`. **Differentiator:** a wrong answer is never a dead end — explained against the exact source sentence, converted into a scheduled flashcard, anchored to a per-concept mastery model that drives what you see next.

### 7.4 Flashcards — true spaced repetition (FSRS), no passive flipping
**Loop:** ① **Prompt** — front only; **no Flip button visible** (deliberate friction). ② **Commit to recall** — type-to-recall (Haiku grades semantic match, not string) or "I've recalled it — reveal" (logs reveal-latency); reveal is gated behind the attempt. ③ **Reveal + confidence grade** — 3D flip (cross-fade under reduced-motion); four buttons map to FSRS Again/Hard/Good/Easy; for typed cards Claude's verdict pre-selects a suggested grade the student can override (machine + self = calibration). ④ **Schedule** — FSRS runs **locally** (`ts-fsrs`, deterministic, offline) → next due date + stability/difficulty, writes the review, animates the card off with "See again in 4 days." ⑤ **Elaborative rescue** (the differentiator) — a card graded Forgot twice / chronically low becomes a "leech": one tap "Help me actually get this" → Opus (streaming) explains why it's missed, gives a mnemonic/analogy tied to the source, and rewrites it into 2 easier laddered sub-cards. ⑥ **Session close** — calm summary: cards retrieved, calibration score, retention curve, "Next session: tomorrow, ~18 due." Lime = streak only. **Generation loop:** candidate cards (Sonnet, structured) land in a **review tray** (keep/edit/discard — editing is itself encoding); quiz-miss + highlight seeds are auto-prioritized (`card_seeds`).

**UI:** three surfaces — Deck Hub (`/decks`, rounded deck cards with a % ring + "N due"), Study View (`/study/[deckId]`, one centered card on a near-empty canvas = ADHD focus by design; confidence cluster on a colorblind-safe **blue→amber luminance ramp** with text labels + icons, not red/green; next-interval ghost text; Focus toggle), Build/Review Tray (swipeable candidates; seed provenance dot). EMPTY = "Nothing to remember yet" + black pill "Build your first deck"; 0 due = "You're caught up. Next 18 unlock tomorrow." with the retention curve. Offline: FSRS scheduling + reviews queue locally and sync on reconnect (study works fully offline). ERROR: grading fails → manual self-grade fallback; generation fails → "retry" preserving source.

**Claude:** Sonnet generation (structured via zod, cache-friendly source prefix, quiz-miss/highlight seeds as MUST-COVER anchors); Haiku free-text recall grading (`{verdict, matched_concepts, missed_concepts, suggested_fsrs_grade, one_line_feedback}`); Opus leech rescue (streaming prose + a structured tail of 2 laddered sub-cards, persisted to `rescue_artifacts` so it's reusable, not re-billed). **Scheduler is never an LLM.** **Data:** `decks`, `flashcards` (FSRS inline), `flashcard_reviews`, `card_seeds`, `rescue_artifacts`. **Differentiator:** it closes the loop on failure — detects the leech and re-teaches instead of re-drilling the identical card.

### 7.5 Mind Map — co-constructed concept graph (build → connect → defend → recall → repair)
**Loop:** ① **Seed (not finish)** — Opus streams only the central topic + 5–9 first-order concepts actually present in the source, with ghost "+" stubs signalling "something belongs here — you find it." Never a finished map. ② **Grow** — student clicks a stub and types the sub-concept (free recall); on blur Claude grades it `confirmed|partial|off_source|misconception` (partial returns the precise phrasing as a diff to accept; Claude never auto-fills). ③ **Connect + defend** — drag an edge, label the relation from a typed palette (causes/is-part-of/contrasts-with/depends-on/example-of/leads-to); Claude validates and fires a one-line Socratic follow-up answered in one sentence (turns a line into a retrieval rep). ④ **Recall gate** — any node collapses to a blanked shell; the student reproduces its definition + outgoing links from memory; Claude scores it and updates SM-2 (`node_reviews`), recoloring by mastery; "Quiz this branch" walks every node under a parent in due order. ⑤ **Repair + revisit** — misconception/partial nodes accumulate in a Weak-spots tray; on reopen due nodes pulse and are re-defended. The map is a living mastery record.

**UI:** full-bleed `@xyflow/react` canvas on the base color; tight-tracked central node; large rounded node cards with relationship-labeled edges; **one lime** reserved for the single next-action affordance (pulsing due node or active ghost stub). Floating pill nav (Map/Outline/Weak spots); collapsible right rail for the Socratic feedback. Status **never color-only**: confirmed=check/solid, partial=tilde/dashed, misconception=warning/double, ghost=plus/dotted. SEED loads as staggered scale-in skeleton nodes; per-node grading shows a spinner ring then a settle/bounce (confirmed) or single shake + warning (misconception). Offline = optimistic local state, reconciles via Realtime. Node text is **real DOM** (SF Pro) so screen readers + magnifier work; full keyboard graph nav (arrow to traverse edges, Enter to grade, Q to quiz).

**Claude:** Opus SEED (streaming SSE; source in a cached system block; returns central + 5–9 concepts only, each with a hidden `source_anchor` never shown). Haiku node-grade / edge-validate (structured, reuses cached prefix; auto-escalates to Sonnet on long/ambiguous text or low confidence). Sonnet Socratic follow-up + recall-gate scoring. **SM-2 math is deterministic server code; the LLM only judges recall quality.** Schemas in `src/lib/schemas/` via `zodOutputFormat`. **Data:** `mind_maps`, `mind_map_nodes` (`authored_by` powers "you built 84% of this map"), `source_anchors` (hidden ground-truth + pgvector prefilter), `mind_map_edges`, `node_reviews`. **Differentiator:** the map only exists because the student rebuilt it from memory, and the SM-2 scheduler pulls them back to their weakest nodes.

### 7.6 Notes — concept-graph notebook (capture → articulate → synthesize → connect → recall)
**Loop:** ⓪ **Capture** — a highlight lands in a right-rail Inbox as raw material (source + page + text + optional margin note); nothing becomes a note yet (a highlight is a prompt to think, not a saved fact). ① **Articulate** (the active beat) — dragging a snippet opens the "Note Forge": the source quote read-only on top and an **empty body** with one Claude retrieval prompt ("In your own words, why does X cause Y? Don't look back"). The student types; an "I'm stuck" affordance gives a Socratic hint, never the answer. ② **Synthesize** — on submit Claude streams a pass that tightens the student's wording (preserving voice), flags claims the source doesn't support ("source says 'correlated', you wrote 'causes' — soften?"), and extracts a title + 2–4 atomic key-points; the student accepts via a diff UI (so the note is theirs). ③ **Connect** — Claude returns up to 3 suggested links to existing notes (relates_to/contradicts/example_of/prerequisite_of) with one-line rationales (pre-filtered by pgvector); confirming a link is itself a recall act → edges in the concept-map view. ④ **Recall** — Quick Recall hides the body, shows title + retrieval prompt; the student re-explains; Claude grades against the key-points (covered/missed/wrong) and bumps the SM-2 next-review (`note_schedule`); a daily "5-minute review" surfaces what's due.

**UI:** three-pane — LEFT collapsed source rail; CENTER the Concept Canvas (editorial card list, pill toggle to Graph view; lime reserved for the "recall due" pulse only); RIGHT the Inbox rail (dotted-halftone separates "unprocessed" from the clean canvas; drag a chip to start). Note Forge = centered glassmorphic composer with dimmed backdrop. Micro: chip lifts on drag; synthesis streams token-by-token; a confirmed link animates as an edge drawing itself; recall dot has a slow breathing pulse. STATES: empty notebook teaches the loop with a faint ghost map; LOADING synthesis keeps the student's text visible/editable under a slim lime hairline (never a blocking spinner); **on any Claude failure the note is ALWAYS saved with `body_student` first**, then a non-blocking "retry refine?" toast — student work is never lost.

**Claude:** Sonnet synthesis (streaming; **frozen system prompt hard-codes "NEVER write the explanation for the student; only refine THEIR words, preserve their voice, surface gaps as questions"**, cached); Haiku link suggestion (structured, candidates pre-filtered by pgvector top-20), Haiku recall grading, Haiku retrieval-prompt + streaming "I'm stuck" hint. Embeddings (Voyage) at note-save → `notes.embedding`. **Data:** `notes` (`body_student` separate from `body_synth` to prove authorship), `note_keypoints`, `note_links`, `note_schedule`, `recall_attempts` (via `understanding_checks`/analytics). **Differentiator:** the student writes the note and Claude organizes it — the kept artifact is a co-authored knowledge map you keep being quizzed on, not a generated doc you skimmed once.

### 7.7 Highlighter — capture that interrogates you back
**Loop:** ① **Select** — drag any text in any reading surface → a floating glass "capture pill" (Highlight / Annotate / Magnify); keyboard select+H. ② **Capture + context** — writes a row immediately (optimistic, lime mark paints instantly): exact text, ~280-char before/after window, source locator, section heading. Never blocks reading. ③ **AI annotation** (the active twist) — within ~1.5s the side-rail card fills via Haiku: a 1-sentence "why this matters" + a single **recall question whose answer is the highlight itself** (reframing at capture flips passive→active). ④ **Active triage** — each card requires one micro-action before it settles: tap "why it matters" in your own words OR "I get it"/"Confused"; Confused cards float up for a deeper explanation on demand (elaborative interrogation at encoding). ⑤ **Recall later** — highlights become spaced-recall items; next session surfaces 3–5 due recall questions (original sentence, word blanked); Claude grades against the highlight + context; wrong reschedules sooner.

**UI:** two-pane reading view; LEFT reader (~68%, calm editorial), RIGHT a Notes rail of rounded cards (one per highlight). The **one lime pop** is the highlight mark + the active recall badge. Capture pill = glassmorphic spring-in popover, icon-only until hover. Card anatomy: lime-left-border snippet → shimmer → streamed annotation → recall question in muted italic with a small lime "you'll be asked this" dot → triage row. EMPTY = halftone panel, "Highlight anything. We'll make it stick." LOADING = per-card skeleton (mark already painted, only the AI line shimmers). ERROR = annotation fails → highlight intact + "Retry annotation" inline; grading fail → "Couldn't grade — here's the source passage."

**Claude:** Haiku annotation + recall-question (structured, **not** streamed — tiny atomic payload, one Supabase write; frozen cacheable system prompt "you are reframing a highlight as a retrieval cue, never just restating it"; volatile highlight+context last so the prefix caches across a session). Sonnet answer grading (`{verdict, feedback, missed_points}`, non-streaming) drives the reschedule. Sonnet streaming deeper explanation on a "Confused" card (on-demand). **Data:** `highlights` (annotation, recall_question, triage), `concept_mastery`/SM-2 scheduling. **Differentiator:** the act of highlighting instantly mints a graded recall question whose answer is what you highlighted, and it returns on a spaced schedule.

### 7.8 Dictionary on Hover — in-context definitions that become a review habit
**Loop (HOVER → PREDICT → CONFIRM → RETAIN):** ① **Read** — every content word is silently a hover target (no underlines, clean editorial page). ② **Hover** — dwell ~350ms → a glass popover anchors under the word (intent signal). ③ **Predict** (the active step competitors skip) — before the definition resolves, the card shows the word, its in-sentence POS, and a 1-tap "I think it means…" with 2 plausible-wrong distractors + the correct one (or a "reveal" for low-friction/ADHD mode); distractors come from the **same Claude call** so there's no extra latency. ④ **Confirm** — resolves to the **contextual** definition (what it means in THIS sentence — "novel" = new, not a book), a plain-language gloss, the disambiguated sense, and a 4-word "why here." Correct = a single lime pulse; wrong = contrast ("you guessed the book-sense; here it's the new-sense"). ⑤ **Retain** — every lookup logs to a per-doc vocab list; the word is faintly dotted (shape, colorblind-safe); a 5-item micro-review at passage end / next session blanks the word in its original sentence; SM-2-lite schedules re-exposure in context.

**UI:** zero dictionary chrome at rest. The card is a 16px-radius glassmorphic popover (~280px): headword (SF Pro Display) + POS pill → predict-step gloss chips (or Reveal) → contextual definition → de-emphasized plain_gloss → tiny "why here" tag. **One lime** = correct-pulse + "add to deck" check. LOADING: card frame + headword + POS appear instantly client-side, shimmer where the definition lands, so the predict-step chips fill the ~400ms call productively (no spinner). ERROR = graceful cached/offline generic gloss + "in-context sense unavailable — tap to retry." Hover-out lingers 600ms then fades (cut instantly under reduced-motion). Micro-review = bottom slim panel, ≤5 cards, large tap targets (ADHD-friendly 60-sec burst).

**Claude:** Haiku, **structured (not streaming)** — one atomic card so distractors + definition arrive together. Strict schema `{word, lemma, pos, contextual_definition, plain_gloss(≤12 words, dyslexia-friendly), sense_tag, why_here(≤8 words), distractors[], difficulty}`. `thinking:{type:'disabled'}` for sub-second TTFB. Target passed as **char offsets** so repeated words ("lead" metal vs verb) disambiguate. **Prompt caching is the cost lever:** `cache_control` on `[frozen system + passage chunk]` together (to clear Haiku's 4096-token floor); a 40-hover session costs ~3 full lookups. `definition_cache` dedupes common words across users on public docs. Escalate to Sonnet only on an explicit "Tell me more" deep dive (streaming). **Data:** `lookups`, `vocab_items`, `definition_cache`. **Differentiator:** sense-disambiguated to THIS passage and the seed of a spaced-repetition habit — they tell you what a word means once; OpenBook makes sure you still know it next week.

### 7.9 Communication Mode — a persisted, proven voice register
**Loop (steps 3–5 are the differentiator vs a passive tone-picker):** ① **Calibrate** — one concept from the student's own material rendered live in all four registers (Formal/Casual/Gen Z/Gen Alpha) as four cards; the student taps the one that clicks (comparing registers is itself metacognitive). ② **Stress-test** — OpenBook immediately asks ONE rapid free-recall question phrased in the chosen register; Claude grades the gist (not wording) and, if wrong, re-explains in the same register and re-asks — **you cannot proceed without producing correct recall** (this converts a preference into an encoding event). ③ **A/B proof** — over the first ~10 study items it silently serves a few explanations in a second candidate register and tracks per-register recall accuracy + time-to-answer + re-explain taps, then surfaces "You recalled 40% faster in Casual than Formal — lock it in?" (self-referent evidence). ④ **Lock + thread** — the chosen register is written to `user_communication_prefs` and injected as a **stable cached system-prompt prefix into every feature**; a floating pill lets you flip mid-session, and flipping triggers a 1-question micro-recall in the new register (prevents register-surfing as avoidance). ⑤ **Re-calibrate on drift** — if recall in the locked register drops below the rolling baseline for a topic, OpenBook offers to re-run the A/B for that topic only (`topic_register_overrides` semantics live in `register_recall_events` aggregates).

**UI:** calm calibration screen, tight-tracked "How should OpenBook talk to you?" over four large rounded cards (same concept, four registers; one lime fills the selected card's check). A persistent glassmorphic floating register pill (current emoji + name; tap expands to a 4-option connected-node arc). Recall gate = single focused card, black/lime pill "Check"; correct = soft spring flip, wrong = gentle re-explain slides in (amber dot + icon + label, **never a red slap**). A/B verdict = one stat card comparing recall % and speed (lime only on the winner's bar) + "Lock it in." STATES: pre-calibration ghost preview cycling registers; LOADING = four skeleton cards (one structured call fills all four at once, resolve together); streaming Haiku explanations with a caret; error = fall back to `register_render_cache` or the last-good register ("Voice unavailable, using your last one").

**Claude:** Sonnet multi-register **render** (one structured call returns all four cards; cached per concept in `register_render_cache`). Haiku for the recall-gate grading and a `record_recall_outcome` write. The chosen register's `style_block_md` is the **load-bearing cached system-prompt prefix** threaded through every other feature. **Data:** `communication_registers` (seeded reference; `style_block_md` versioned), `user_communication_prefs`, `register_recall_events` (the A/B ledger), `register_render_cache`. **Accessibility:** each register's `style_block` hard-caps `max_sentence_words` and bans purple prose — doubling as a reading-load preset for dyslexia/ADHD. **Differentiator:** competitors offer a static tone toggle; OpenBook gates every register choice behind free-recall and proves which voice makes YOU remember.

### 7.10 Analytics — "The Next Action Engine" (diagnose → decide → do → re-measure)
**Loop:** ① **Diagnose** (on load) — each studied concept carries a Bayesian mastery estimate + a half-life "decay clock" predicting recall-probability-now; the 1–3 concepts about to cross below ~80% (the desirable-difficulty window) are spotlighted, everything else collapsed (hide the 92%-mastered, spotlight the 3 decaying). ② **Decide** (the forced hop) — a single "Today's Move" card ("Review Krebs Cycle — you'll forget it in ~14h, prerequisite for 3 exam topics") **cannot be dismissed without choosing**: [Start 4-min review] or [Snooze] (which makes you pick a reason — a metacognitive judgment that feeds the model). ③ **Do** (in-surface, never a redirect) — a focused review drawer with 3–6 Claude items targeting exactly the decaying sub-concepts; free-recall first, then self-grade against a revealed model answer with a 1–4 confidence button. ④ **Re-measure** (instant, visible) — the mastery ring animates to its new value, the decay clock resets later, a calibration readout shows predicted-vs-actual, and the next Today's Move slides in. ⑤ **Weekly coach** — Opus reads the week's calibration data, spots patterns, and writes a short coaching note that re-tunes next week's scheduling weights.

**UI:** above the fold = one "Today's Move" card (big SF Pro Display concept name, Claude rationale line, a thin decay clock draining lime→desaturated-amber, black pill "Start 4-min review" + ghost "Snooze"); sticky until resolved. Below = a mastery map of concept nodes on the prerequisite DAG, each a small card with a circular **mastery ring** (not a bar); decaying nodes pulse, mastered ones dim/shrink. Review drawer slides up (mobile)/in (desktop) as a glass panel over the dimmed map; one item at a time, huge centered prompt, "Reveal model answer," 1–4 confidence row, then a spring where the ring fills and the clock resets. Coach panel = a quiet right-rail letter, updated weekly. EMPTY = no fake charts: "Analytics unlock as you learn. Finish one review and your first decay clock starts." LOADING = skeleton rings shimmer (math loads instantly from Postgres; only the Claude rationale streams). ERROR = Claude rationale fail → deterministic fallback rationale built from raw stats ("Recall dropping below 80% in ~14h — review now") so the loop never breaks.

**Claude:** **All math (Bayesian update, half-life regression, scheduling) is TypeScript/Postgres, never Claude.** Haiku "Today's Move" copy + modality pick (structured, frozen cacheable pedagogy prefix). Sonnet retrieval-practice item generation (on drawer open; targets the actual gap from prior wrong answers; `effort:'medium'`). Haiku self-grade adjudication (only when self-grade conflicts with the free-text recall — counters self-grading inflation). Opus weekly coaching synthesis (streaming, Supabase cron — the only Opus and only streaming call). **Data:** `concepts`, `concept_mastery` (`recall_prob_now = 2^(-hrs_since/half_life)`, `next_review` at target retention; nightly cron recompute), `quiz_attempts`/`flashcard_reviews`/`understanding_checks` (review-attempt log), `daily_moves`, `calibration_weekly`. **Differentiator:** the only analytics that tells you WHEN to study a specific concept and forces the review to happen inside the analytics surface with the retention curve visibly resetting — a forward scheduler, not a rear-view report.

---

## 8. Landing page spec

**"The Page That Reads Back."** One ordinary document is the protagonist for the entire scroll. It begins flat, grey, and asleep on a calm editorial canvas; under the visitor's own scroll it learns to **see → talk → ask → remember → adapt to you**, then turns to face the visitor and asks the next question. We never describe active learning in a feature grid — **the page performs it.** Spine from "The Page That Reads Back"; rigor (reversible scroll-scrubber, shared-element morph, functional dropzone) and first-person tutor warmth woven in.

**Lives at** `src/app/page.tsx` (Server Component shell) composing client islands in `src/components/landing/*`. Motion via existing `framer-motion@12`; scroll scrubbing = `useScroll`/`useTransform` + native `IntersectionObserver`; concept map = inline SVG. **No new heavy deps** (no GSAP/Lenis unless a perf pass proves it necessary).

### 8.1 Global rules
- **One green at a time** — `--ob-accent` renders on at most one element per viewport; never a gradient, never decoration, only where learning happens.
- **Dotted halftone** — a reusable `<Halftone/>` radial-masked dot pattern at ~3% ink, bleeding from top corners; never a full grid.
- **Easing** `--ease-ob: cubic-bezier(.22,.61,.36,1)`; UI 400–700ms; marker sweeps ~600ms.
- **`prefers-reduced-motion` mandatory** — `useReducedMotionSafe()`; under reduced motion every scene renders at its END frame, statically, fully legible (no pins, no sweeps, no confetti).

### 8.2 Component map
```
src/components/landing/
  Nav.tsx           floating glass pill, 6px lime progress dot (only persistent green)
  Halftone.tsx
  DocumentCard.tsx  THE protagonist — ONE persistent instance, layoutId="doc", morphs across all scenes
  Hero.tsx          Scene 0 — Sleeping Page + Wake Sweep
  SceneSee.tsx      Scene 1 — highlights & triage (scrubbed)
  SceneTalk.tsx     Scene 2 — tutor in the margin (connector thread)
  SceneAsk.tsx      Scene 3 — active-recall gate (scroll-snap pin) — THE HINGE
  SceneRemember.tsx Scene 4 — words peel into SVG concept map
  SceneAdapt.tsx    Scene 5 — accessibility lenses (live DOM)
  SceneSources.tsx  Scene 6 — input chips funnel
  Proof.tsx         Scene 7a — quiet evidence + count-up
  Close.tsx         Scene 7b — turn-to-camera + functional dropzone → real ingest
  primitives/{WakeText,MarkerSweep,TutorPill,ScrubScene}.tsx
```
**`WakeText`** (the most-reused primitive): animates a run of text from `--ob-text-asleep` + `saturate(0) blur(.3px) translateY(2px)` → `--ob-text-primary` + `saturate(1) blur(0) translateY(0)`. **`ScrubScene`**: `sticky top-0 h-screen` stage inside a tall `min-h-[220vh]` track; `useScroll` → normalized 0..1 `progress` (forced to 1 under reduced motion).

### 8.3 Section-by-section
- **Nav** — fixed centered glass pill (`top-24px`, `max-w-720`, `backdrop-blur-20`, `bg-surface/70`, 1px border, `shadow-float`); wordmark `OpenBook` (no icon) · `Product · Method · Access · Pricing` · pill CTA `Start learning` (black light / lime dark). On scroll >40px the pill narrows to ~640px and the shadow deepens; a ≤6px lime dot fills with total scroll progress (the only persistent green).
- **Scene 0 Hero — "The Sleeping Page"** — `<DocumentCard asleep/>` grey/desaturated; headline upper-left overlapping the card top: "Reading isn't / learning." (`display-2xl`, −0.03em, leading .95); subhead "Every other tool hands you a summary and walks away. OpenBook stays — it reads with you, asks the hard questions, and makes it stick." **Wake Sweep** (auto once ~2.4s, re-fires on hover): custom study-cursor drifts in → `WakeText` lifts one sentence → `MarkerSweep` lime highlight (clip-path L→R, pen-pressure taper) → `TutorPill` slides from the margin, curved connector draws, types **"Why does this matter?"** with a caret shimmer. Leaves the page half-awake. Cue: "Scroll to wake the page."
- **Scene 1 "It learns to see"** — `ScrubScene`; a vertical pass de-greys ~5 load-bearing sentences and lime-underlines ~2 (one at a time) while dimming filler; margin tally "signal / filler." Fully reversible on scroll-up.
- **Scene 2 "It learns to talk"** — a curved connector draws from a precise clause to a margin `TutorPill`; the clause pulses once in lime; tutor types a first-person micro-dialogue with a student reply chip ("in the margin, on this line," not a far-off chatbot).
- **Scene 3 "It learns to ask" — THE HINGE** — `ScrubScene` with a **scroll-snap pin** that doesn't release until engaged; the paragraph folds shut into a recall card ("Without looking — what did this paragraph claim?", 3 chips or short input). Correct → chip turns lime once, tutor "That's it.", scroll releases. Wrong (intentional) → "Not quite — let's look again," the source line re-opens and re-highlights, retry. One polite escape: a quiet "Reveal answer" link (keyboard-operable, never trapping). This is the passive→active flip and the page's signature interaction.
- **Scene 4 "It learns to remember"** — `ScrubScene`; scrubbing lifts highlighted terms out of the shrinking card and lands them as connected SVG nodes; edges draw (`stroke-dashoffset`); a "Review in 2 days" cue beside it; hovering a node back-highlights its origin sentence (bidirectional, reversible). One node glows lime at a time.
- **Scene 5 "It learns YOU"** — static but interactive; four lens toggles **Focus · Read · See · Color** transform the REAL DOM of this section's copy: Focus dims all but the hovered line; Read widens letter/word/line spacing + heavier weight + off-white tint; See activates the global magnifier-bold cursor; Color swaps to a colorblind-safe palette (lime + a second hue still distinguishable; never color alone). Framed as the tutor's patience, not compliance — **no "WCAG" in user-facing copy**.
- **Scene 6 "Any source, one living page"** — input chips (PDF · Word · PowerPoint · Google Docs · PNG/JPG · `.ipynb`/`.md` · YouTube · GitHub) drift into the one card and are absorbed with a single soft lime ripple (one at a time).
- **Scene 7a Proof** — quiet editorial; one disciplined count-up stat (fires once on inView; final number under reduced motion), one plain testimonial ("studying didn't feel lonely"), a manifesto breather: **"A summary is not studying."**
- **Scene 7b The Close** — the protagonist `DocumentCard` performs a 3D turn-to-camera (now full-ink, fully awake); tutor types **"Ready when you are."** The card face becomes a **functional dropzone + paste field** — real drag-and-drop and URL paste kick off the actual ingest call (wire to `/api/ingest` / Supabase signed upload) so the loop literally begins on the landing page. Primary CTA **"Stop reading. Start learning."** (black light / lime dark); secondary ghost "Bring something you're struggling with." Footer: wordmark, minimal links, light/dark toggle, halftone fade-out.

### 8.4 The shared element (critical)
`DocumentCard` must be **one persistent instance** across Hero → See → Talk → Ask → Remember → Sources → Close, transformed in place via `layoutId="doc"` so it morphs (grey→lit→folded→shrunk→turned) and never cut-replaces. The visitor must feel they are working one page the whole way down — that continuity *is* the argument.

### 8.5 Copy voice
First-person tutor at the emotional beats ("Why does this matter?", "Not quite — let's look again", "That's it.", "Ready when you are."), warm and present rather than an effect. Headlines tight-tracked and declarative ("Reading isn't learning.", "A summary is not studying."). Never feature-grid marketing prose.

### 8.6 Acceptance criteria
All content readable and all interactions reachable under `prefers-reduced-motion: reduce` (scenes at end-frame, no pins/sweeps). The Ask gate has a non-blocking "Reveal answer" escape and full keyboard operability — never trap keyboard/screen-reader users. Lenses/magnifier are real and global where specified, toggle off cleanly, never break layout. 60fps on scrubbed scenes (transforms/opacity/clip-path only; `position: sticky` pins; lazy-mount the SVG map; no layout thrash). **Lighthouse a11y ≥ 95.** Color is never the sole carrier of meaning. Full light/dark parity (dark mode inverts CTA to lime pill).

---

## 9. Phased implementation roadmap

Each phase ships a working slice; later phases build only on what earlier ones proved.

### Phase 0 — Foundation & design system
- Remove Geist woff (`src/app/fonts/`) and the `Arial` body font from `globals.css`; add SF Pro `@font-face local()` bridge + `--font-*` CSS vars; self-host OpenDyslexic woff2 in `/public/fonts`.
- Write all color/spacing/radius/shadow/motion tokens into `globals.css` (`:root` + `[data-theme='dark']`); extend `tailwind.config.ts` (`darkMode: ['class', "[data-theme='dark']"]`, `theme.extend.{colors,boxShadow,borderRadius,fontFamily}`, the type scale as utilities).
- Build primitives: `Pill`, `Card`, `Button` (black/white pill + lime accent), `SegmentedControl`, `Halftone`, `MasteryRing`, `ConceptNode`/`ConceptEdge` SVG, `GlassPanel`, `Skeleton` (dotted shimmer), focus-ring utilities.
- `ThemeProvider` + `AccessibilityProvider` (client) writing `<html>` data-attrs from `profiles.prefs`; the four modes (Reading Lens magnify/bold overlay, Dyslexia spacing, ADHD focus dimming, Colorblind tokens) + global `prefers-reduced-motion` block. Floating Accessibility pill.
- Run the full Supabase migration (§4) including RLS, `match_chunks`, storage bucket + policies; seed `communication_registers`. Generate typed DB types. Add `src/lib/supabase/admin.ts` (service role), `ratelimit.ts`, `ai-usage.ts`.
- **Deliverable:** themable, accessible component library + live DB with RLS; both modes pixel-correct.

### Phase 1 — Landing page
- Build `DocumentCard` (static, both themes) + `Nav` + `Halftone`; then `WakeText`, `MarkerSweep`, `TutorPill`, `ScrubScene`.
- Scenes in order: Hero Wake Sweep (auto-once + reduced-motion path) → SceneSee → SceneTalk → **SceneAsk gate** (build the unlock + escape first — hardest) → SceneRemember SVG map (wire shared `layoutId`) → SceneAdapt lenses + global magnifier → SceneSources → Proof → Close.
- Reduced-motion + a11y + perf pass; light/dark QA; Lighthouse a11y ≥ 95.
- **Deliverable:** the public landing page performing the thesis; Close dropzone stubbed to the ingest entry point.

### Phase 2 — Auth + ingestion + workspace shell
- `(auth)` routes: email/OTP + Google (Drive grant) + GitHub (repo grant) via `@supabase/ssr`; `callback`/`confirm` route handlers; `middleware.ts` session refresh + `(app)` gate; profile auto-seed trigger verified.
- `(app)` shell: layout with pill nav, command palette, focus toggle; dashboard, library, upload pages (RSC + Suspense).
- Ingestion pipeline (§6): `/api/ingest` + connectors (youtube/github/gdrive) + `/api/storage/sign`; parsers + structure-aware chunking; Voyage embeddings; Realtime `documents.status` progress; at-ingest starter-questions + Files-API upload + concept seeding.
- Document split-view shell (`documents/[docId]/layout.tsx`) + reader (`page.tsx`) streaming chunks with `HighlightLayer` + `HoverMagnifier` mounted.
- **Deliverable:** a user can sign up, upload any input type, watch it ingest, and read it in the workspace.

### Phase 3 — Q&A + RAG (the flagship loop)
- `src/lib/rag/{embed,retrieve,rerank}.ts`; `/api/chat` (Haiku router + gate → Opus streaming tutor with cached document prefix + Files-API citations → Sonnet check grader, two-pass to respect the citations/structured-output constraint); tool-use manual loop with the four app tools.
- Tutor UI: three-pane (concept-map left, editorial chat center with `[1]` pills + understanding-check card, source rail right); streaming with lime caret + ARIA-live; `understanding_checks` + `concept_mastery` writes; prompt-cache warm cron.
- **Deliverable:** the citation-grounded Socratic tutor with the understanding-check retention engine — the moat feature, end to end.

### Phase 4 — Active-recall study modes (Summary, Quiz, Flashcards)
- **Summary "Study Ladder":** `/api/summary` (Opus two-pass spine/anchoring, Haiku Layer-2 + checkpoint-gen, Sonnet checkpoint/teach-back grading); progressive-disclosure UI with predict-before-reveal gates and the consolidate teach-back; `summaries` + `concept_mastery`.
- **Quizzes:** `/api/quiz/generate` (Opus, structured, span-validated distractors) + `/api/quiz/grade` (Sonnet streaming); one-card runner, confidence slider, concept-coverage pill, miss→flashcard, server-side adaptive branching (no LLM); `quizzes`/`quiz_items`/`quiz_attempts`.
- **Flashcards:** `ts-fsrs` local scheduler (`src/lib/fsrs.ts`); `/api/flashcards/{generate,grade,rescue}` (Sonnet gen, Haiku recall grade, Opus leech rescue); Deck Hub / Study View (gated reveal, colorblind confidence ramp) / Build Tray; offline review queue; `decks`/`flashcards`/`flashcard_reviews`/`card_seeds`/`rescue_artifacts`. Quiz misses + highlights feed `card_seeds`.
- **Deliverable:** three independent recall loops sharing the concept graph and the FSRS/SM-2 schedulers.

### Phase 5 — Authoring & capture modes (Mind Map, Notes, Highlighter, Dictionary)
- **Mind Map:** `@xyflow/react` canvas; `/api/mindmap/{seed,grade,recall}` (Opus seed stream, Haiku→Sonnet grade, Sonnet socratic/recall; deterministic SM-2); `mind_maps`/`nodes`/`edges`/`source_anchors` (pgvector prefilter)/`node_reviews`; keyboard graph nav + colorblind status shapes.
- **Notes:** `@tiptap/*` editor; Note Forge composer; `/api/notes/{synthesize,link,grade,hint}` (Sonnet synthesis with the frozen "never author" prompt, Haiku link/grade/hint); `notes` (student vs synth bodies)/`note_keypoints`/`note_links`/`note_schedule`; save-first-on-failure guarantee.
- **Highlighter:** capture pill + optimistic lime paint; `/api/highlights/{annotate,grade}` (Haiku annotation+recall-question, Sonnet grading); triage cards; spaced resurfacing on the dashboard.
- **Dictionary on Hover:** `DictionaryHover` client island; `/api/dictionary` (Haiku structured, char-offset disambiguation, `[system+passage]` caching, `definition_cache` dedupe); predict→confirm card; `lookups`/`vocab_items`; micro-review panel.
- **Deliverable:** every reading surface turns capture into a graded, scheduled retrieval object.

### Phase 6 — Communication Mode + Study Rooms
- **Communication Mode:** seed `communication_registers`; calibration + stress-test + A/B + lock-and-thread (the register `style_block_md` becomes the cached system-prompt prefix injected into every feature's handler); floating register pill with micro-recall on flip; `/api/register/{render,recall}` (Sonnet render, Haiku recall); `register_render_cache`.
- **Study Rooms:** Supabase Realtime (Presence + Broadcast + Postgres Changes); `/api/companion` shared tutor Broadcast-fanned to members; room RLS via Realtime Authorization; never forces a host's accessibility prefs on members.
- **Deliverable:** the proven voice threads through the whole platform; groups learn in sync.

### Phase 7 — Analytics + accessibility/perf polish
- **Analytics "Next Action Engine":** TypeScript/Postgres mastery + half-life + scheduling (no LLM); `/api/analytics/{move,items,adjudicate}` (Haiku copy + adjudication, Sonnet items); `/api/cron/{analytics-decay,coach-weekly}` (nightly recompute + Opus weekly coaching); Today's-Move forced-decision card, mastery-map rings, in-surface review drawer with live curve reset; `daily_moves`/`calibration_weekly`/`concept_mastery`.
- **Cross-cutting polish:** end-to-end accessibility audit (keyboard loops, ARIA-live, focus order, colorblind shape-encoding everywhere, magnifier across all surfaces, dyslexia spacing, ADHD focus on every learning card); `prefers-contrast`/`prefers-reduced-transparency`; cost dashboards from `ai_usage`; Upstash quotas + Batches API for bulk jobs; cache-hit verification; Lighthouse + perf pass on the heaviest client islands (mindmap canvas, reader).
- **Deliverable:** the predictive scheduler closes the platform loop; accessibility and cost controls are verified product-wide.
