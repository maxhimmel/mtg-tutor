"use client";

import type { ReactNode } from "react";
import { type Card, CURVE_TOP, castingValue, isLand } from "@mtg-tutor/core";

/**
 * The wells a forty is laid out in on a table: one per turn it can act on, and
 * lands.
 *
 * Extracted from the results board when the BUILD screen was rebuilt on it. Both
 * screens show the same forty a minute apart -- one to make it, one to argue with
 * it -- and they were two different pictures of it, which is a worse problem than
 * either picture being wrong. The chrome lives here so that the layout is a
 * single decision rather than a resemblance two files have to keep up.
 *
 * What does NOT live here is what goes in a well. The results board fills one
 * with two decks merged into rows; the builder fills it with cards you are
 * playing and, under a rule, the ones you cut. Those are genuinely different
 * contents in the same furniture, and a prop that switched between them would be
 * this module knowing about both screens.
 */

export interface PileLabel {
  label: string;
  // Read aloud in place of the label, which is a bare number on the page.
  spoken: string;
}

// Lands are the last pile rather than a footnote: they are seventeen of the
// forty, and a board that showed only the spells would be a board showing half a
// deck.
export const PILE_LABELS: PileLabel[] = [
  ...Array.from({ length: CURVE_TOP }, (_, i) => ({
    label: i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : String(i + 1),
    spoken: i + 1 === CURVE_TOP ? `Turn ${CURVE_TOP} and up` : `Turn ${i + 1}`,
  })),
  { label: "Lands", spoken: "Lands" },
];

export const LANDS_PILE = PILE_LABELS.length - 1;

// The same bucketing `manaCurve` does, and by `castingValue` for the same reason:
// a split card sits on the half you would actually cast.
export function pileIndexOf(card: Card): number {
  return isLand(card)
    ? LANDS_PILE
    : Math.min(CURVE_TOP, Math.max(1, Math.ceil(castingValue(card)))) - 1;
}

/** One array per well, in `PILE_LABELS` order, empties included. */
export function pileUp<T>(items: readonly T[], cardOf: (item: T) => Card): T[][] {
  const piles: T[][] = PILE_LABELS.map(() => []);
  for (const item of items) piles[pileIndexOf(cardOf(item))].push(item);
  return piles;
}

/**
 * auto-fit rather than a fixed seven: the board keeps its wells at a placard's
 * width and drops to fewer of them on a narrow screen, which is the one thing
 * that must not be traded away -- a squeezed pile is a column of truncated names.
 *
 * `gutter` is for a board that hangs a number beside every card -- the builder
 * puts the win rate there, because that is the number a cut is made on. It has to
 * come out of the WELL and not out of the placard, so the minimum widens by about
 * what the gutter costs and names truncate in roughly the same place on both
 * boards. It is deliberately not the full cost: a wider minimum is a board that
 * drops to six wells sooner than the other one does, and the two are meant to be
 * the same picture.
 */
export function PileGrid({ gutter = false, children }: { gutter?: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid gap-2.5 ${
        gutter
          ? "grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))]"
          : "grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * A well rather than a bare column. Set side by side with nothing around them,
 * seven stacks of bright placards read as one field of colour and the column
 * boundaries have to be inferred from the gaps -- which is exactly the reading
 * these boards depend on. Recessed into the page (base-100 inside a base-200
 * panel) each pile is a slot on a table with cards in it, and the shape of the
 * curve comes off the fills instead of off the cards.
 */
export function PileWell({
  label,
  spoken,
  aside,
  children,
}: {
  label: string;
  spoken: string;
  // Opposite the label on the header rule: whatever this board counts.
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-1.5 rounded-lg border border-base-300/70 bg-base-100 p-2"
      aria-label={spoken}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-base-300 pb-1">
        <h3 className="font-display text-sm font-semibold tracking-tight text-base-content/80">
          {label}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
