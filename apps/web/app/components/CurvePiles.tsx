"use client";

import type { ReactNode } from "react";
import { type Card, CURVE_TOP, castingValue, isLand } from "@mtg-tutor/core";
import { INK, MARK } from "../charts/ink";

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
 * The wrap used to cost the curve, because both boards claimed a pile's HEIGHT
 * was its bar. Below about 800px the wells fall onto two rows, the rows are
 * stretched independently, and a height compared across rows is comparing
 * nothing. `CurveBar` is what makes the wrap free: every well draws its own bar
 * on one shared scale, so two wells sitting on different rows are still the same
 * measurement and the reading survives a phone.
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
 * panel) each pile is a slot on a table with cards in it.
 *
 * The well is where the cards go and the `bar` slot is where the curve goes.
 * That separation is the correction: a pile is not a measurement of anything --
 * it holds cards both boards put there for reasons other than the curve -- so
 * the measurement is drawn, once, under the header that states it.
 */
export function PileWell({
  label,
  spoken,
  aside,
  bar,
  children,
}: {
  label: string;
  spoken: string;
  // Opposite the label on the header rule: whatever this board counts.
  aside?: ReactNode;
  // Under the rule, above the cards: the well's `CurveBar`. A slot rather than
  // a caller's first child, so the one thing both boards must draw identically
  // is placed in one file instead of resembling itself in two.
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-1.5 rounded-lg border border-base-300/70 bg-base-100 p-2"
      aria-label={spoken}
    >
      <header className="flex flex-col gap-1.5 border-b border-base-300 pb-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-semibold tracking-tight text-base-content/80">
            {label}
          </h3>
          {aside}
        </div>
        {bar}
      </header>
      {children}
    </section>
  );
}

/**
 * The curve, drawn as a bar per well, because the pile of cards under it is not
 * the curve and never was.
 *
 * BOTH BOARDS SAID IT WAS AND BOTH WERE WRONG, in the same way and for different
 * reasons. The builder pins the cards you have CUT to the floor of the well they
 * came from, so a well with two playing and six cut has the mass of an eight-card
 * column while the number in its header says two. The results board interleaves
 * the other deck's ghosts into the same pile, so a column's height is the union
 * of two decks and is wrong for either of them. In both cases the shape and the
 * number in the header were answering different questions and only the number
 * was answering the right one.
 *
 * So the bar is drawn, and it counts exactly what the header counts. What the
 * cards do underneath is then free to be the argument -- cuts under a dashed
 * rule, ghosts among the rows -- without any of it being mistaken for the curve.
 *
 * The scale is shared across the wells and stated by the track: full width is
 * the biggest well on the board. It is a proportion between wells rather than an
 * absolute count, which is what a curve is read as -- nobody asks whether the
 * three-drops are five, they ask whether there are more of them than four-drops.
 *
 * LANDS GET NO BAR. Seventeen of them against five three-drops would flatten
 * every spell well to a stub, and a mana curve has never counted lands: the
 * well's number and its "+ N basics" line are the whole of what there is to say.
 */
export function CurveBar({
  count,
  most,
  theirs,
  yours = INK.value,
}: {
  count: number;
  /** The tallest spell well on this board. The right-hand end of the scale. */
  most: number;
  /** The other deck's count in this well, where there is another deck. */
  theirs?: number;
  /** What the filled bar is painted with. See DeckBoard for when this is gold. */
  yours?: string;
}) {
  if (most <= 0) return null;
  const across = (n: number) => `${Math.min(100, (n / most) * 100)}%`;

  return (
    // Hidden from the reading order rather than labelled: every value it draws
    // is printed as a digit in the header directly above it, so a second spoken
    // copy would be the same number twice.
    <div aria-hidden className="flex flex-col gap-[2px]">
      <Track>
        <span
          className="block h-full rounded-full"
          style={{ width: across(count), background: yours }}
        />
      </Track>
      {theirs != null && (
        // A hollow bar on its own lane rather than an outline laid over the
        // gold. Same left edge, same scale, so agreement is two bars that end
        // together and a disagreement is an overhang -- which is a length, and
        // lengths are what the eye is already reading here. The pair used to be
        // carried by OPACITY, dimmed the wrong way round so that agreement was
        // the faint state and looked identical to a well with no data.
        <Track>
          <span
            className="block h-full rounded-full border"
            style={{ width: across(theirs), borderColor: INK.theirs }}
          />
        </Track>
      )}
    </div>
  );
}

// The domain, drawn. Without it a short bar and a missing bar are the same
// picture, and "no three-drops" is a thing a curve has to be able to say.
function Track({ children }: { children: ReactNode }) {
  return (
    <span
      className="block w-full overflow-hidden rounded-full"
      style={{ height: MARK.band, background: INK.rule }}
    >
      {children}
    </span>
  );
}
