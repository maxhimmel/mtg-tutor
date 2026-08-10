"use client";

import type { DeckRow } from "@mtg-tutor/core";
import { CardPlacard } from "./CardPlacard";
import { LANDS_PILE, PILE_LABELS, PileGrid, PileWell, pileIndexOf } from "./CurvePiles";

/**
 * A forty, laid out the way a forty is laid out on a table.
 *
 * Every Magic player who wants to look at a deck puts it in piles by mana cost,
 * and every deck-building client draws it that way. It is also the one layout
 * that gives a placard the narrow column it was drawn for -- which the results
 * screen could not do while it was showing the deck as one full-width list.
 *
 * The piles ARE the curve. This replaced a bar chart sitting above a list of the
 * same cards: two pictures of one fact, neither of which could say WHERE on the
 * curve the two decks disagreed. Here a pile's height is its bar, and the pair of
 * numbers in its header is the exact comparison the bars could only approximate.
 *
 * The disagreement is drawn into the piles rather than listed beside them. A card
 * both decks play is a plain placard, one only you play carries a gold rail, and
 * one only the suggestion plays is a ghost -- the same frame with an empty plate.
 * So a deck that is four cards apart shows four marks in the two columns where it
 * matters, instead of a separate panel you have to hold in your head.
 */

interface Pile {
  label: string;
  spoken: string;
  rows: DeckRow[];
  mine: number;
  theirs: number;
  // The one pile whose count is not just its rows: basics are land slots nobody
  // drafted, so they are a number under the cards rather than cards.
  basics?: Basics;
}

export interface Basics {
  mine: number;
  theirs: number;
}

function pilesOf(rows: readonly DeckRow[], basics: Basics): Pile[] {
  const piles: Pile[] = PILE_LABELS.map((pile) => ({ ...pile, rows: [], mine: 0, theirs: 0 }));
  // Basics are not cards anyone drafted, so they are a count rather than rows --
  // but they are still land slots, so the lands pile's totals start from them and
  // match what the deck actually runs.
  piles[LANDS_PILE] = { ...piles[LANDS_PILE], mine: basics.mine, theirs: basics.theirs, basics };

  for (const row of rows) {
    const card = row.built ?? row.suggested;
    if (!card) continue;
    const pile = piles[pileIndexOf(card)];
    pile.rows.push(row);
    if (row.built) pile.mine++;
    if (row.suggested) pile.theirs++;
  }

  return piles;
}

export function DeckBoard({
  rows,
  basics,
  // With nothing to compare, every mark and every second number is noise: the
  // board is just your deck, in piles.
  agreed,
  // Whose the other forty is. The board was written against the app's own
  // suggestion and said so in four places; a challenge puts a real person on
  // that side, and "only in the suggestion" is then simply wrong. Defaulted
  // rather than required, because the results screen's reading is still the
  // common one.
  theirs = "the suggestion",
}: {
  rows: readonly DeckRow[];
  basics: Basics;
  agreed: boolean;
  theirs?: string;
}) {
  const piles = pilesOf(rows, basics);

  return (
    <div className="flex flex-col gap-4">
      {!agreed && <Legend theirs={theirs} />}
      <PileGrid>
        {piles.map((pile) => (
          <PileColumn key={pile.label} pile={pile} agreed={agreed} theirs={theirs} />
        ))}
      </PileGrid>
    </div>
  );
}

function Legend({ theirs }: { theirs: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/55">
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-primary/80" />
        Only in your build
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-3.5 w-5 rounded-[3px] border border-dashed border-base-content/40"
        />
        Only in {theirs}
      </span>
    </div>
  );
}

function PileColumn({
  pile,
  agreed,
  theirs,
}: {
  pile: Pile;
  agreed: boolean;
  theirs: string;
}) {
  const { basics } = pile;

  return (
    <PileWell
      label={pile.label}
      spoken={pile.spoken}
      aside={
        <>
          {/* Two bare numbers side by side say nothing out loud, so the pair is
              drawn for the eye and spoken separately. */}
          <span aria-hidden className="text-xs tabular-nums">
            <span className={pile.mine === 0 ? "text-base-content/30" : "text-base-content/70"}>
              {pile.mine}
            </span>
            {!agreed && (
              <>
                <span className="text-base-content/25"> · </span>
                {/* Dimmed only where the two agree. A column where they do not is
                    where the shape of the argument is, and it should be findable
                    by running an eye along the headers. */}
                <span
                  className={
                    pile.theirs === pile.mine ? "text-base-content/30" : "text-base-content/70"
                  }
                >
                  {pile.theirs}
                </span>
              </>
            )}
          </span>
          <span className="sr-only">
            {agreed
              ? `${pile.mine} cards`
              : `${pile.mine} in your build, ${pile.theirs} in ${theirs}`}
          </span>
        </>
      }
    >
      {pile.rows.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {/* Keyed by position: two copies of a common share a name, and nothing
              reorders these rows. */}
          {pile.rows.map((row, i) => (
            <PileRow key={i} row={row} agreed={agreed} theirs={theirs} />
          ))}
        </ul>
      )}

      {basics && basics.mine + basics.theirs > 0 && (
        <p className="text-xs tabular-nums text-base-content/45">
          + {basics.mine} basic{basics.mine === 1 ? "" : "s"}
          {!agreed && basics.theirs !== basics.mine && (
            <span className="text-base-content/30"> · {basics.theirs} in {theirs}</span>
          )}
        </p>
      )}
    </PileWell>
  );
}

function PileRow({
  row,
  agreed,
  theirs,
}: {
  row: DeckRow;
  agreed: boolean;
  theirs: string;
}) {
  const card = row.built ?? row.suggested;
  if (!card) return null;

  const ghost = row.built == null;
  const yoursOnly = row.built != null && row.suggested == null;

  return (
    <li className="flex items-stretch gap-1.5">
      {/* Always drawn, gold only where it means something -- so a card both decks
          play sits on the same left edge as one only you play, and the rail is a
          mark rather than an indent. */}
      {!agreed && (
        <span
          aria-hidden
          className={`w-[3px] shrink-0 rounded-full ${yoursOnly ? "bg-primary/80" : ""}`}
        />
      )}
      <CardPlacard card={card} ghost={ghost} className="min-w-0 flex-1" />
      {(ghost || yoursOnly) && (
        <span className="sr-only">
          {ghost ? `only in ${theirs}` : "only in your build"}
        </span>
      )}
    </li>
  );
}
