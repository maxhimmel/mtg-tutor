"use client";

import { type DeckRow, CURVE_TOP, castingValue, isLand } from "@mtg-tutor/core";
import { CardPlacard } from "./CardPlacard";

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
  // Read aloud in place of the label, which is a bare number on the page.
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

// Lands are the seventh pile rather than a footnote: they are seventeen of the
// forty, the suggestion disagrees about how many to run, and a board that showed
// only the spells would be a board showing half a deck.
function pilesOf(rows: readonly DeckRow[], basics: Basics): Pile[] {
  const turns: Pile[] = Array.from({ length: CURVE_TOP }, (_, i) => ({
    label: i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : String(i + 1),
    spoken: i + 1 === CURVE_TOP ? `Turn ${CURVE_TOP} and up` : `Turn ${i + 1}`,
    rows: [],
    mine: 0,
    theirs: 0,
  }));
  // Basics are not cards anyone drafted, so they are a count rather than rows --
  // but they are still land slots, so the pile's totals start from them and match
  // what the deck actually runs.
  const lands: Pile = {
    label: "Lands",
    spoken: "Lands",
    rows: [],
    mine: basics.mine,
    theirs: basics.theirs,
    basics,
  };

  for (const row of rows) {
    const card = row.built ?? row.suggested;
    if (!card) continue;
    // The same bucketing manaCurve does, and by castingValue for the same reason:
    // a split card sits on the half you would actually cast.
    const pile = isLand(card)
      ? lands
      : turns[Math.min(CURVE_TOP, Math.max(1, Math.ceil(castingValue(card)))) - 1];

    pile.rows.push(row);
    if (row.built) pile.mine++;
    if (row.suggested) pile.theirs++;
  }

  return [...turns, lands];
}

export function DeckBoard({
  rows,
  basics,
  // With nothing to compare, every mark and every second number is noise: the
  // board is just your deck, in piles.
  agreed,
}: {
  rows: readonly DeckRow[];
  basics: Basics;
  agreed: boolean;
}) {
  const piles = pilesOf(rows, basics);

  return (
    <div className="flex flex-col gap-4">
      {!agreed && <Legend />}
      {/* auto-fit rather than a fixed seven: the board keeps its columns at a
          placard's width and drops to fewer of them on a narrow screen, which is
          the one thing that must not be traded away -- a squeezed pile is a
          column of truncated names. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2.5">
        {piles.map((pile) => (
          <PileColumn key={pile.label} pile={pile} agreed={agreed} />
        ))}
      </div>
    </div>
  );
}

function Legend() {
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
        Only in the suggestion
      </span>
    </div>
  );
}

function PileColumn({ pile, agreed }: { pile: Pile; agreed: boolean }) {
  const { basics } = pile;

  return (
    // A well rather than a bare column. Set side by side with nothing around
    // them, seven stacks of bright placards read as one field of colour and the
    // column boundaries have to be inferred from the gaps -- which is exactly the
    // reading this board depends on. Recessed into the page (base-100 inside a
    // base-200 panel) each pile is a slot on a table with cards in it, and the
    // shape of the curve comes off the fills instead of off the cards.
    <section
      className="flex flex-col gap-1.5 rounded-lg border border-base-300/70 bg-base-100 p-2"
      aria-label={pile.spoken}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-base-300 pb-1">
        <h3 className="font-display text-sm font-semibold tracking-tight text-base-content/80">
          {pile.label}
        </h3>
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
            : `${pile.mine} in your build, ${pile.theirs} in the suggestion`}
        </span>
      </header>

      {pile.rows.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {/* Keyed by position: two copies of a common share a name, and nothing
              reorders these rows. */}
          {pile.rows.map((row, i) => (
            <PileRow key={i} row={row} agreed={agreed} />
          ))}
        </ul>
      )}

      {basics && basics.mine + basics.theirs > 0 && (
        <p className="text-xs tabular-nums text-base-content/45">
          + {basics.mine} basic{basics.mine === 1 ? "" : "s"}
          {!agreed && basics.theirs !== basics.mine && (
            <span className="text-base-content/30"> · {basics.theirs} suggested</span>
          )}
        </p>
      )}
    </section>
  );
}

function PileRow({ row, agreed }: { row: DeckRow; agreed: boolean }) {
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
          {ghost ? "only in the suggestion" : "only in your build"}
        </span>
      )}
    </li>
  );
}
