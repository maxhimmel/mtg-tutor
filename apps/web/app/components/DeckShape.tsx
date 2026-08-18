"use client";

import { type DisplayCard, cardTypes, creatureTypes, tally } from "@mtg-tutor/core";
import { ManaCurve } from "./ManaCurve";

// Enough to see what the deck is becoming without turning the panel into a wall
// of one-off tribes; the rest stay in the tooltip.
const TOP_CREATURE_TYPES = 6;

/**
 * What a pile of cards adds up to: when it can play, what it is made of, and
 * what it is about.
 *
 * Lifted out of the draft board's picks column, which is where it was written
 * and where it is still the most useful thing on the screen. The misses drill
 * shows a deck too -- the deck you had when you made the pick it is asking
 * about -- and that deck decides the answer, so it has to be legible in the
 * same three registers rather than as a list of names beside the pack.
 *
 * The two callers differ in what they let you DO to the pile, not in what the
 * pile is: the board's is droppable and has a sideboard under it, the drill's
 * is a fact about a Tuesday in August and cannot be edited. So the analysis is
 * shared and the affordances are not, which is the line this component draws.
 *
 * Takes DisplayCard rather than Card because that is all it reads, and because
 * the drill's pool genuinely has no more than that on it.
 */
export function DeckShape({ cards }: { cards: DisplayCard[] }) {
  const types = tally(cards, cardTypes);
  const tribes = tally(cards, creatureTypes);
  const asCounts = (counts: [string, number][]) =>
    counts.map(([n, c]) => `${n} ${c}`).join(" · ");

  return (
    <>
      {/* Above the counts, because it answers a question they cannot: the tally
          says what the pool is made of, the curve says when it can play it. */}
      <ManaCurve cards={cards} />

      {types.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-base-300 pb-2.5">
          <div className="flex flex-wrap gap-1">
            {types.map(([type, n]) => (
              <span key={type} className="badge badge-ghost badge-sm font-normal">
                {type} {n}
              </span>
            ))}
          </div>
          {tribes.length > 0 && (
            <div className="truncate text-xs text-base-content/60" title={asCounts(tribes)}>
              {asCounts(tribes.slice(0, TOP_CREATURE_TYPES))}
              {tribes.length > TOP_CREATURE_TYPES && " …"}
            </div>
          )}
        </div>
      )}
    </>
  );
}
