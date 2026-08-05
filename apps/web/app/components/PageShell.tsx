import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";

// The frame every screen sits in. It exists because the frame used to be seven
// hand-copied `<main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">` tags
// with the header pasted inside each one, and the glossary page shipped without
// it -- no gutter, content flush to both edges of the viewport, header adrift
// from the body it belongs to. Nothing catches that: the page renders, it is
// just wrong, and only a side-by-side with another page shows it.
//
// So the header is not a slot the caller fills. PageShell renders it, which
// makes "the header lives inside the container" true by construction rather
// than by everyone remembering.
//
// 1500px is the app's outer bound, not a reading measure -- a page of prose
// should still cap its own column well inside it (see /glossary, /principles).
//
// The masthead takes nothing from the page. It used to take a slot for the
// per-page middle, and everything that went in there -- which set, which pick,
// quiz on or off, the links between a review's views -- belongs to the page and
// now sits in it, under PageHeading.
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <AppHeader />
      {children}
    </main>
  );
}

// A screen that is currently one sentence: "Loading draft…", or why it failed.
// Deliberately keeps the masthead off, which is what these states did before
// this component existed -- the nav appearing only once the board resolves.
export function PageNotice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1500px] px-6 py-5">
      <p className={tone === "error" ? "text-error" : "text-base-content/60"}>{children}</p>
    </main>
  );
}
