"use client";

import { type Card, CURVE_TOP, manaCurve } from "@mtg-tutor/core";
import { frameFor } from "../lib/cardFrame";

// The pool's shape, in the one dimension a Limited deck lives or dies on: what
// it can do on turn two and what it is still holding on turn six.
//
// A card is one segment, painted with the exact ring its placard is drawn with,
// so a column says how many AND in which colours -- a five-card three-slot that
// is three blue and two red is a curve; the same five all off-colour is not.
// Columns are scaled against the tallest, not against a fixed height, because
// the reading is comparative: this is a shape, not a measurement.

// Tall enough that a one-card difference between neighbouring columns is
// visible in a 360px side panel, short enough to leave the picks list the room.
const CHART_HEIGHT = 68;

const WUBRG = ["W", "U", "B", "R", "G"];

// Stable bands rather than pick order: a stack that reshuffles its colours on
// every pick reads as movement where nothing has moved.
const byColor = (a: Card, b: Card) => {
  const key = (c: Card) => c.colors.map((col) => WUBRG.indexOf(col)).join(",");
  return key(a).localeCompare(key(b)) || a.name.localeCompare(b.name);
};

export function ManaCurve({ cards }: { cards: Card[] }) {
  const curve = manaCurve(cards);
  const tallest = Math.max(...curve.map((b) => b.cards.length));
  if (tallest === 0) return null;

  const label = curve
    .map((b) => `${b.label === `${CURVE_TOP}+` ? `${CURVE_TOP} or more` : b.label}: ${b.cards.length}`)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`Mana curve by mana value — ${label}`}
      className="flex items-end gap-1.5"
      style={{ height: CHART_HEIGHT }}
    >
      {curve.map((bucket) => (
        <div key={bucket.label} className="flex h-full flex-1 flex-col items-center gap-1">
          <span
            aria-hidden
            className={`text-[0.625rem] leading-none tabular-nums ${bucket.cards.length > 0 ? "text-base-content/60" : "text-base-content/25"}`}
          >
            {bucket.cards.length}
          </span>

          {/* The bar grows off the axis, so the column keeps the space its
              tallest neighbour needs and nothing shifts as the pool fills. */}
          <div className="flex w-full flex-1 items-end">
            <div
              className="flex w-full flex-col-reverse gap-px overflow-hidden rounded-[3px] ring-1 ring-black/25"
              style={{ height: `${(bucket.cards.length / tallest) * 100}%` }}
            >
              {[...bucket.cards].sort(byColor).map((card, i) => (
                <span
                  key={`${card.name}-${i}`}
                  className="min-h-0.5 flex-1"
                  style={{ background: frameFor(card).ring }}
                  title={card.name}
                />
              ))}
            </div>
          </div>

          {/* The axis in the game's own notation: the generic mana pip the cost
              is printed with. The top bucket is everything from six up, and the
              pips stop being literal there, so it is marked rather than faked. */}
          <span aria-hidden className="flex items-center text-[0.5625rem] leading-none">
            <i className={`ms ms-cost ms-${bucket.turn}`} />
            {bucket.turn === CURVE_TOP && (
              <span className="-ml-px text-base-content/45">+</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
