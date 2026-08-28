"use client";

import { type DisplayCard, CURVE_TOP, manaCurve } from "@mtg-tutor/core";
import { colorBands, sayColumn } from "../lib/curveBands";
import { useCursorTip } from "./CursorTip";

// The pool's shape, in the one dimension a Limited deck lives or dies on: what
// it can do on turn two and what it is still holding on turn six.
//
// THE BANDS ARE COLOURS, NOT CARDS. A segment per card was the first drawing and
// it lost bands without saying so: at `min-h-0.5` plus a hairline gap, twelve
// cards needed 35px of a 36px bar and fifteen needed 44, so the last WUBRG band
// in a full pool's tallest column was clipped away while the count printed above
// it went on reading fifteen. `curveBands` carries the argument for the fix and
// for why the proportion was the better reading anyway -- the count is already
// on the screen, so what the drawing is FOR is the split.
//
// Columns are scaled against the tallest, not against a fixed height, because
// the reading is comparative: this is a shape, not a measurement.

// Tall enough that a one-card difference between neighbouring columns is visible
// in a 360px side panel, short enough to leave the picks list the room.
//
// It sizes the BAR rather than the whole chart now, because the bar is the part
// with a guarantee attached. Bands are exact shares of it and cannot overflow
// it, so the worst a band does is come out thin -- and the tallest column, which
// gets the whole 44px, still gives six pixels each to a seven-way split no real
// pool reaches.
const BAR_HEIGHT = 44;

export function ManaCurve({ cards }: { cards: DisplayCard[] }) {
  const curve = manaCurve(cards);
  const tallest = Math.max(...curve.map((b) => b.cards.length));
  const tip = useCursorTip();
  if (tallest === 0) return null;

  const label = curve
    .map((b) => `${b.label === `${CURVE_TOP}+` ? `${CURVE_TOP} or more` : b.label}: ${b.cards.length}`)
    .join(", ");

  return (
    <>
      <div
        role="img"
        aria-label={`Mana curve by mana value — ${label}`}
        className="flex items-end gap-1.5"
      >
        {curve.map((bucket) => (
          <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1">
            <span
              aria-hidden
              className={`text-[0.625rem] leading-none tabular-nums ${bucket.cards.length > 0 ? "text-base-content/60" : "text-base-content/25"}`}
            >
              {bucket.cards.length}
            </span>

            {/* The bar grows off the axis, so the column keeps the space its
                tallest neighbour needs and nothing shifts as the pool fills.

                The pointer gets the split and then the card names. Both are
                longer forms of what is already drawn or printed here, which is
                the only footing a hover is allowed to stand on. What it
                replaced was a `title=` on a two-pixel strip that named one
                card and did not exist at all on a touch screen. */}
            <div
              className="flex w-full items-end"
              style={{ height: BAR_HEIGHT }}
              {...tip.follow(() => (bucket.cards.length > 0 ? sayColumn(bucket.cards) : null))}
            >
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-[3px] ring-1 ring-black/25"
                style={{ height: `${(bucket.cards.length / tallest) * 100}%` }}
              >
                {colorBands(bucket.cards).map((band) => (
                  <span
                    key={band.key}
                    // Exact shares of one bar, summing to it. That is what makes
                    // clipping impossible rather than unlikely: no gap and no
                    // minimum height, so there is nothing for the total to
                    // exceed. The seam between two bands is an inset shadow for
                    // the same reason -- it costs no height, so it cannot push
                    // the last band off the end.
                    style={{
                      height: `${(band.count / bucket.cards.length) * 100}%`,
                      background: band.frame.ring,
                      boxShadow: "inset 0 1px 0 rgb(0 0 0 / 0.25)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* The axis in the game's own notation: the generic mana pip the
                cost is printed with. The top bucket is everything from six up,
                and the pips stop being literal there, so it is marked rather
                than faked. */}
            <span aria-hidden className="flex items-center text-[0.5625rem] leading-none">
              <i className={`ms ms-cost ms-${bucket.turn}`} />
              {bucket.turn === CURVE_TOP && (
                <span className="-ml-px text-base-content/45">+</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Outside the figure rather than inside it: `role="img"` makes its whole
          subtree one labelled image, and a box that follows the pointer is not
          part of that picture. */}
      {tip.node}
    </>
  );
}
