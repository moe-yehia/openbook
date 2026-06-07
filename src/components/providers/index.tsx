"use client";

import { ThemeProvider } from "./theme-provider";
import { AccessibilityProvider } from "./accessibility-provider";
import { ReadingLens } from "./reading-lens";
import { AccessibilityBar } from "./accessibility-bar";

/** App-wide client providers + the global accessibility layer. */
export function Providers({
  children,
  showAccessibilityBar = true,
}: {
  children: React.ReactNode;
  showAccessibilityBar?: boolean;
}) {
  return (
    <ThemeProvider>
      <AccessibilityProvider>
        {children}
        <ReadingLens />
        {showAccessibilityBar && <AccessibilityBar />}
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

/**
 * No-flash boot script — runs before paint to apply theme + accessibility
 * data-attributes from localStorage, so there is no flash of the wrong theme
 * or un-accommodated state on first render. Injected in <head> as a raw string.
 */
export const themeBootScript = `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem('ob-theme')||'system';
var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
var r=t==='system'?sys:t;
d.setAttribute('data-theme',r);d.style.colorScheme=r;
var a={};try{a=JSON.parse(localStorage.getItem('ob-a11y')||'{}')}catch(e){}
d.setAttribute('data-dyslexia',a.dyslexia?'on':'off');
d.setAttribute('data-focus',a.focus?'on':'off');
d.setAttribute('data-reduced-motion',a.reduceMotion?'on':'off');
d.setAttribute('data-cvd',a.cvd||'none');
d.setAttribute('data-lens',a.lens||'off');
if(a.lensZoom)d.style.setProperty('--ob-lens-zoom',String(a.lensZoom));
}catch(e){}})();`;
