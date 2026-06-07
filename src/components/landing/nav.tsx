"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";
import { Wordmark } from "@/components/ui/wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Method", href: "#story" },
  { label: "Access", href: "#adapt" },
  { label: "Sources", href: "#sources" },
];

export function Nav() {
  const { scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setScrolled(v > 0.01));

  // 6px lime progress ring (r=7, circumference ≈ 43.98)
  const dash = useTransform(scrollYProgress, (v) => 43.98 * (1 - v));

  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
      <motion.nav
        initial={false}
        animate={{ maxWidth: scrolled ? 640 : 720 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "ob-glass pointer-events-auto flex w-full items-center justify-between gap-4 rounded-pill py-2 pl-5 pr-2",
          scrolled ? "shadow-e4" : "shadow-float"
        )}
      >
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="-rotate-90">
            <circle cx="9" cy="9" r="7" fill="none" stroke="rgb(var(--ob-border))" strokeWidth="2" />
            <motion.circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              stroke="rgb(var(--ob-accent))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={43.98}
              style={{ strokeDashoffset: dash }}
            />
          </svg>
          <Wordmark />
        </div>

        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-callout text-content-secondary transition-colors hover:text-content-primary"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-callout font-medium text-content-secondary hover:text-content-primary sm:inline"
          >
            Sign in
          </Link>
          <Button href="/signup" size="sm" variant="primary">
            Start learning
          </Button>
        </div>
      </motion.nav>
    </div>
  );
}
