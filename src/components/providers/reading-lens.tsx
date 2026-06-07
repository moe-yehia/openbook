"use client";

/**
 * Reading Lens — the signature accessibility flourish (BUILD_SPEC §2.7).
 * Two interchangeable modes, both pure overlays so the underlying layout
 * NEVER reflows and the design is preserved pixel-for-pixel:
 *   • magnify — a circular loupe follows the cursor showing a 1.8–3× zoom of
 *     whatever is under it, by cloning the element under the pointer (the clone
 *     keeps its classNames, so the global stylesheet styles it for free).
 *   • bold    — the text node under the cursor gets a transient weight/tracking
 *     boost (weight-only, so it reserves space and does not reflow).
 * Disabled inside text inputs. Tracks 1:1 even under reduced motion.
 */

import { useEffect, useRef } from "react";
import { useA11y } from "./accessibility-provider";

const LENS_SIZE = 168;

function isTypingTarget(el: Element | null): boolean {
  if (!el) return true;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function ReadingLens() {
  const { prefs } = useA11y();
  const mode = prefs.lens;
  const zoom = prefs.lensZoom;

  const lensRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boldElRef = useRef<HTMLElement | null>(null);
  const boldPrev = useRef<{ weight: string; spacing: string } | null>(null);
  const clonedFrom = useRef<Element | null>(null);

  useEffect(() => {
    if (mode === "off") return;

    let raf = 0;
    let px = -9999;
    let py = -9999;

    const restoreBold = () => {
      const el = boldElRef.current;
      if (el && boldPrev.current) {
        el.style.fontWeight = boldPrev.current.weight;
        el.style.letterSpacing = boldPrev.current.spacing;
      }
      boldElRef.current = null;
      boldPrev.current = null;
    };

    const tick = () => {
      raf = 0;
      const lens = lensRef.current;
      const stage = stageRef.current;

      // What is under the cursor (ignoring the lens overlay itself)?
      const lensEl = lensRef.current;
      if (lensEl) lensEl.style.visibility = "hidden";
      const target = document.elementFromPoint(px, py);
      if (lensEl) lensEl.style.visibility = "visible";

      if (!target || isTypingTarget(target)) {
        if (lens) lens.style.opacity = "0";
        if (mode === "bold") restoreBold();
        return;
      }

      if (mode === "bold") {
        if (target !== boldElRef.current) {
          restoreBold();
          const el = target as HTMLElement;
          boldPrev.current = {
            weight: el.style.fontWeight,
            spacing: el.style.letterSpacing,
          };
          const computed = parseInt(getComputedStyle(el).fontWeight || "400", 10);
          el.style.fontWeight = String(Math.min(900, computed + 250));
          el.style.letterSpacing = "0.01em";
          boldElRef.current = el;
        }
        return;
      }

      // magnify
      if (!lens || !stage) return;
      lens.style.opacity = "1";
      lens.style.transform = `translate(${px - LENS_SIZE / 2}px, ${py - LENS_SIZE / 2}px)`;

      const rect = target.getBoundingClientRect();
      if (clonedFrom.current !== target) {
        const clone = target.cloneNode(true) as HTMLElement;
        clone.style.margin = "0";
        stage.innerHTML = "";
        stage.appendChild(clone);
        stage.style.width = `${rect.width}px`;
        clonedFrom.current = target;
      }
      // Map the pointer's position within the target to the lens centre.
      const localX = px - rect.left;
      const localY = py - rect.top;
      const tx = LENS_SIZE / 2 - localX * zoom;
      const ty = LENS_SIZE / 2 - localY * zoom;
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    };

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      if (lensRef.current) lensRef.current.style.opacity = "0";
      if (mode === "bold") restoreBold();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      restoreBold();
      clonedFrom.current = null;
    };
  }, [mode, zoom]);

  if (mode !== "magnify") return null;

  return (
    <div
      ref={lensRef}
      data-ob-lens
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: LENS_SIZE,
        height: LENS_SIZE,
        borderRadius: "50%",
        overflow: "hidden",
        pointerEvents: "none",
        opacity: 0,
        zIndex: 9999,
        boxShadow:
          "0 0 0 1px rgb(var(--ob-accent-ring)), 0 8px 28px -8px rgba(0,0,0,.35)",
        background: "rgb(var(--ob-surface))",
        willChange: "transform",
      }}
    >
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      />
    </div>
  );
}
