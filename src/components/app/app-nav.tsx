"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { Wordmark } from "@/components/ui/wordmark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/library", label: "Library" },
  { href: "/analytics", label: "Analytics" },
];

export function AppNav({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-8">
          <Wordmark href="/dashboard" />
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "rounded-pill px-3.5 py-1.5 text-callout font-medium transition-colors",
                    active
                      ? "bg-surface-sunken text-content-primary"
                      : "text-content-secondary hover:text-content-primary"
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button href="/upload" size="sm" variant="primary">
            <Plus className="h-4 w-4" />
            New
          </Button>
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-label="Account menu"
              aria-expanded={menu}
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-callout font-semibold text-accent-foreground"
            >
              {initial}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
                <div className="absolute right-0 top-11 z-20 w-60 rounded-xl border border-border bg-surface-elevated p-1.5 shadow-float">
                  <div className="px-3 py-2">
                    <div className="truncate text-callout font-medium text-content-primary">
                      {name || "Student"}
                    </div>
                    <div className="truncate text-caption text-content-tertiary">{email}</div>
                  </div>
                  <Link
                    href="/settings/profile"
                    className="block rounded-md px-3 py-2 text-callout text-content-secondary hover:bg-surface-sunken hover:text-content-primary"
                    onClick={() => setMenu(false)}
                  >
                    Settings
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-callout text-content-secondary hover:bg-surface-sunken hover:text-content-primary"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
