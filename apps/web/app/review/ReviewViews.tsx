"use client";

import Link from "next/link";

// One finished draft, three ways of reading it. Each page used to link to its
// siblings from the masthead in its own words and its own direction -- "Full
// breakdown →", "← Step through instead", "← Step through the picks" -- so which
// views existed depended on where you were standing, and none of them said which
// one you were on.
//
// They are mutually exclusive views of one object, which is what the app's
// segmented control already means everywhere else it appears (the pick ceremony,
// the breakdown's scope). Same control, made of links.
const VIEWS = [
  { key: "walkthrough", label: "Walkthrough", path: (id: string) => `/review/${id}` },
  { key: "breakdown", label: "Breakdown", path: (id: string) => `/review/${id}/breakdown` },
  { key: "deck", label: "Deck", path: (id: string) => `/review/${id}/deck` },
] as const;

export type ReviewView = (typeof VIEWS)[number]["key"];

export function ReviewViews({
  sessionId,
  current,
}: {
  sessionId: string;
  current: ReviewView;
}) {
  return (
    <nav className="flex rounded-lg bg-base-300 p-0.5" aria-label="Views of this draft">
      {VIEWS.map((view) => {
        const here = view.key === current;
        return (
          <Link
            key={view.key}
            href={view.path(sessionId)}
            aria-current={here ? "page" : undefined}
            className={`rounded-md px-3 py-1 text-sm no-underline transition-colors ${
              here
                ? "bg-primary font-semibold text-primary-content"
                : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
