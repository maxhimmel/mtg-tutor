"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./UserMenu";

// The app's frame, and only that. It used to take a `children` slot for the
// per-page middle -- the draft's counters, the review's score and quiz toggle --
// which made it a different shape on every page and left it reading as half
// navbar, half toolbar. Page state and page controls now live in the page, under
// PageHeading; this says where you are in the app and nothing else.
//
// `/` is the set picker, which is where a draft starts, so it is named Draft
// rather than left to the wordmark. That also separates it from Principles,
// which as "Draft principles" sat next to Review looking like a second verb.
const NAV = [
  { href: "/", label: "Draft", match: (p: string) => p === "/" || p.startsWith("/draft") },
  { href: "/review", label: "Review", match: (p: string) => p.startsWith("/review") },
  { href: "/principles", label: "Principles", match: (p: string) => p.startsWith("/principles") },
  { href: "/glossary", label: "Glossary", match: (p: string) => p.startsWith("/glossary") },
];

export function AppHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 border-b border-base-300">
      <div className="flex flex-wrap items-center gap-x-6">
        <Link
          href="/"
          className="py-3 font-display text-xl font-semibold tracking-tight text-base-content no-underline"
        >
          mtg<span className="text-primary">-</span>tutor
        </Link>

        <nav className="flex items-center gap-x-5" aria-label="Sections">
          {NAV.map((item) => {
            const here = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={here ? "page" : undefined}
                // The marker is a segment of the header's own bottom rule, drawn
                // in parchment rather than gold. Gold in this app means the thing
                // you are holding or the choice you have made -- a card pulled
                // out of the pack, the ceremony you picked. Where you happen to
                // be standing is not that, and colouring it gold would make four
                // of them, one of which is always lit.
                className={`-mb-px border-b-2 py-3 text-sm no-underline transition-colors ${
                  here
                    ? "border-base-content/70 text-base-content"
                    : "border-transparent text-base-content/55 hover:text-base-content"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <UserMenu />
    </header>
  );
}
