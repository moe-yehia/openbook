"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type CvdMode = "none" | "deut" | "prot" | "trit";
export type LensMode = "off" | "magnify" | "bold";

export type A11yPrefs = {
  dyslexia: boolean;
  focus: boolean;
  cvd: CvdMode;
  reduceMotion: boolean;
  lens: LensMode;
  lensZoom: number; // 1.8 – 3
};

export const DEFAULT_A11Y: A11yPrefs = {
  dyslexia: false,
  focus: false,
  cvd: "none",
  reduceMotion: false,
  lens: "off",
  lensZoom: 2,
};

type A11yCtx = {
  prefs: A11yPrefs;
  set: <K extends keyof A11yPrefs>(key: K, value: A11yPrefs[K]) => void;
  toggle: (key: "dyslexia" | "focus" | "reduceMotion") => void;
  reset: () => void;
};

const Ctx = createContext<A11yCtx | null>(null);
const STORAGE_KEY = "ob-a11y";

function applyToDom(p: A11yPrefs) {
  const root = document.documentElement;
  root.setAttribute("data-dyslexia", p.dyslexia ? "on" : "off");
  root.setAttribute("data-focus", p.focus ? "on" : "off");
  root.setAttribute("data-reduced-motion", p.reduceMotion ? "on" : "off");
  root.setAttribute("data-cvd", p.cvd);
  root.setAttribute("data-lens", p.lens);
  root.style.setProperty("--ob-lens-zoom", String(p.lensZoom));
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_A11Y);

  // Always-current ref so setters never close over stale state.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const next = raw ? { ...DEFAULT_A11Y, ...JSON.parse(raw) } : DEFAULT_A11Y;
      setPrefs(next);
      applyToDom(next);
    } catch {
      applyToDom(DEFAULT_A11Y);
    }
  }, []);

  const persist = useCallback((next: A11yPrefs) => {
    setPrefs(next);
    applyToDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — DOM is still updated */
    }
    // TODO(phase 2): mirror to profiles.prefs via server action once authed.
  }, []);

  const set = useCallback<A11yCtx["set"]>(
    (key, value) => persist({ ...prefsRef.current, [key]: value }),
    [persist]
  );

  const toggle = useCallback<A11yCtx["toggle"]>(
    (key) => persist({ ...prefsRef.current, [key]: !prefsRef.current[key] }),
    [persist]
  );

  const reset = useCallback(() => persist(DEFAULT_A11Y), [persist]);

  const value = useMemo(
    () => ({ prefs, set, toggle, reset }),
    [prefs, set, toggle, reset]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useA11y() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useA11y must be used within AccessibilityProvider");
  return ctx;
}
