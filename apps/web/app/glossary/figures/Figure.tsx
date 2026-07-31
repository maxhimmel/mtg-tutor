import type { ReactNode } from "react";
import { CARD_STAT_GLOSSARY, SCORING_GLOSSARY } from "@mtg-tutor/core";

// The chrome the page's four figures share.
//
// It exists because the argument only holds if they read as one instrument
// rather than four charts that happen to sit on the same page. Every figure here
// makes the same SHAPE of argument -- here is a number, here is what it hides --
// so the structure is fixed: setup above the plot, verdict below it. The reader
// learns where to look once and afterwards only has to read the plot.
//
// The colour rule is fixed with it, and it is the theme's own: gold is whichever
// quantity is being defined, neutral is whatever it is measured against. Never
// two saturated hues in one figure, and never red-vs-green, which would smuggle
// in a judgement none of these numbers make.

const LABELS = new Map([...CARD_STAT_GLOSSARY, ...SCORING_GLOSSARY].map((e) => [e.id, e.label]));

// A stat named inside a figure's prose, linked to its own entry below. The
// figures are where a reader meets these acronyms first, so every mention is a
// way into the definition rather than something to go hunting for.
export function Term({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      className="font-semibold text-base-content underline decoration-base-content/30 underline-offset-4 transition-colors hover:decoration-base-content"
    >
      {LABELS.get(id) ?? id}
    </a>
  );
}

// The same ramp as the .eyebrow utility, but the colour is the caller's: these
// name the ends of a measure, and the end being measured has to be gold.
// Colouring .eyebrow instead would put two text-* utilities in one Tailwind
// layer, where the winner is decided by sort order rather than by intent.
export const FIG_LABEL = "text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";

export function Figure({
  title,
  // The opening figure sits above the page's sections and is an h2; the other
  // three sit under a section heading, so they are h3. Passed rather than
  // inferred, because only the caller knows what it nested the figure inside.
  headingLevel: Heading = "h3",
  lede,
  children,
  coda,
}: {
  title: string;
  headingLevel?: "h2" | "h3";
  lede: ReactNode;
  children: ReactNode;
  coda: ReactNode;
}) {
  return (
    <figure className="rounded-box border border-base-content/15 bg-base-200 p-5 sm:p-7">
      <figcaption className="max-w-xl">
        <Heading className="font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
          {title}
        </Heading>
        <p className="mt-2 text-sm leading-relaxed text-base-content/70">{lede}</p>
      </figcaption>

      <div className="mt-7">{children}</div>

      <p className="mt-8 max-w-xl border-l-2 border-primary pl-4 leading-relaxed">{coda}</p>
    </figure>
  );
}
