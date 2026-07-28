"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu } from "./UserMenu";

// The same masthead on every page, which the three pages were each rebuilding
// slightly differently. `children` is the per-page middle -- the draft's pack
// and pick counters, on the one page that has them.
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-base-300 pb-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href="/"
          className="font-display text-xl font-semibold tracking-tight text-base-content no-underline"
        >
          mtg<span className="text-primary">-</span>tutor
        </Link>
        <Link
          href="/review"
          className="text-sm text-base-content/60 transition-colors hover:text-primary"
        >
          Review
        </Link>
        <Link
          href="/principles"
          className="text-sm text-base-content/60 transition-colors hover:text-primary"
        >
          Draft principles
        </Link>
      </div>
      {children}
      <UserMenu />
    </header>
  );
}
