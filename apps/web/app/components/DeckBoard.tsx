"use client";

import type { DeckRow } from "@mtg-tutor/core";
import { INK } from "../charts/ink";
import { Key } from "../charts/Key";
import { CardPlacard } from "./CardPlacard";
import {
  CurveBar,
  LANDS_PILE,
  LaneMark,
  PILE_LABELS,
  type PileLabel,
  PileGrid,
  PileWell,
  pileIndexOf,
} from "./CurvePiles";

/**
 * A forty, laid out the way a forty is laid out on a table.
 *
 * Every Magic player who wants to look at a deck puts it in piles by mana cost,
 * and every deck-building client draws it that way. It is also the one layout
 * that gives a placard the narrow column it was drawn for -- which the results
 * screen could not do while it was showing the deck as one full-width list.
 *
 * THE CURVE IS THE BAR IN EACH WELL'S HEADER, and it had to become one. This
 * board replaced a chart sitting above a list of the same cards -- two pictures
 * of one fact, neither able to say WHERE the two decks disagreed -- and what
 * went in its place was the claim that a pile's height was its bar. That claim
 * was false the moment the second deck arrived: the other forty's ghosts are
 * interleaved into the same pile, so a column's height is the union of both
 * decks and is the curve of neither. `CurveBar` draws what the header counts,
 * on one scale across the board, twice where there are two decks.
 *
 * The disagreement is drawn into the piles rather than listed beside them. A card
 * both decks play is a plain placard, one only you play carries a gold rail, and
 * one only the suggestion plays is a ghost -- the same frame with an empty plate.
 * So a deck that is four cards apart shows four marks in the two columns where it
 * matters, instead of a separate panel you have to hold in your head.
 */

interface Pile extends PileLabel {
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
  // One scale for the whole board and for both decks on it. Taken over the
  // spell wells only -- see CurveBar on why seventeen lands are not a point on
  // a curve -- and over both counts, so the two bars in a well are lengths that
  // can be compared with each other as well as down the row.
  const most = Math.max(
    ...piles.slice(0, LANDS_PILE).map((pile) => Math.max(pile.mine, agreed ? 0 : pile.theirs)),
  );

  return (
    <div className="flex flex-col gap-4">
      {!agreed && <Legend theirs={theirs} />}
      <PileGrid>
        {piles.map((pile) => (
          <PileColumn
            key={pile.label}
            pile={pile}
            most={most}
            agreed={agreed}
            theirs={theirs}
          />
        ))}
      </PileGrid>
    </div>
  );
}

/**
 * What the two decks are drawn with, in one place.
 *
 * IT NAMES THE HEADER PAIR NOW, which is the half that was missing. Two bare
 * digits either side of a dot said nothing about which deck was which, and the
 * only thing that ever said it was an `sr-only` sentence -- so a sighted reader
 * had to infer the order from a column where the two disagreed, which is the
 * column they were trying to find in the first place. The bar entries are the
 * key to the header bars and to the numbers above them at once.
 *
 * The counts stay off these entries deliberately, unlike everywhere else a key
 * carries one: there is no single number for "your build" here, there are seven
 * of them, and they are printed in the wells.
 */
function Legend({ theirs }: { theirs: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Key
        entries={[
          // `swatch` rather than the default chip, because the chip is a pill
          // and what these entries stand for is a BAR ON A TRACK -- the key was
          // explaining a shape that appears nowhere on the board. `LaneMark`
          // draws the lane itself, which also carries the remainder: a bar here
          // is a share of the widest well, and a mark with no track behind it
          // cannot say that.
          {
            label: "Your build",
            ink: INK.yours,
            shape: "bar",
            swatch: <LaneMark ink={INK.yours} track />,
          },
          {
            label: `In ${theirs}`,
            ink: INK.theirs,
            shape: "hollow",
            swatch: <LaneMark ink={INK.theirs} hollow track />,
          },
        ]}
      />
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
    </div>
  );
}

function PileColumn({
  pile,
  most,
  agreed,
  theirs,
}: {
  pile: Pile;
  most: number;
  agreed: boolean;
  theirs: string;
}) {
  const { basics } = pile;

  return (
    <PileWell
      label={pile.label}
      spoken={pile.spoken}
      mv={pile.mv}
      andUp={pile.andUp}
      aside={
        <>
          {/* Two bare numbers side by side say nothing out loud, so the pair is
              drawn for the eye and spoken separately.

              BOTH AT FULL INK. The pair used to carry "these two disagree" on
              opacity, and inverted: the AGREEING column was the dim one, at
              /30, which is under 2:1 against this ground and identical to how
              this app draws a number it does not have. So agreement read as
              missing data, and the disagreement it was meant to pick out was
              carried by the weakest channel on the page. It is carried by the
              bars under here now, where a difference is an overhang -- a
              length, which is what the rest of the well is already read in. */}
          <span aria-hidden className="flex items-center gap-2 text-xs tabular-nums">
            {/* Gold on the left number only while there is a right one. It is
                the same statement the key makes and the same the bar under it
                makes -- this side is yours -- and with nothing to compare
                against there is nothing for it to distinguish, so it goes back
                to plain ink rather than spending the one saturated colour on
                the page for a decoration.

                EACH NUMBER CARRIES ITS OWN MARK once there are two, which is
                the half the pair was missing. Gold against plain ink is hue
                doing the whole job -- the exact thing this app is not allowed
                to ask of a colour -- and the middle dot said nothing at all
                about which side was which. Filled against hollow is the same
                vocabulary the key states and the two lanes below draw, so the
                header, the bars and the legend are now one sentence rather
                than three that happen to agree. */}
            <span className="flex items-center gap-1" style={{ color: agreed ? INK.value : INK.yours }}>
              {!agreed && <LaneMark ink={INK.yours} />}
              {pile.mine}
            </span>
            {!agreed && (
              <span className="flex items-center gap-1" style={{ color: INK.theirs }}>
                <LaneMark ink={INK.theirs} hollow />
                {pile.theirs}
              </span>
            )}
          </span>
          <span className="sr-only">
            {agreed
              ? `${pile.mine} cards`
              : `${pile.mine} in your build, ${pile.theirs} in ${theirs}`}
          </span>
        </>
      }
      bar={
        // `basics` is set on exactly one well, which is the lands well -- so it
        // is also the test for the well a curve does not have a bar for.
        pile.basics ? undefined : (
          <CurveBar
            count={pile.mine}
            most={most}
            theirs={agreed ? undefined : pile.theirs}
            yours={agreed ? INK.value : INK.yours}
          />
        )
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
        // Only drawn where the two differ, so its presence is what says they do
        // -- which leaves nothing for opacity to carry, and lets the number be
        // read at the same weight as any other value on the board.
        <p className="text-xs tabular-nums" style={{ color: INK.value }}>
          + {basics.mine} basic{basics.mine === 1 ? "" : "s"}
          {!agreed && basics.theirs !== basics.mine && (
            <span style={{ color: INK.theirs }}> · {basics.theirs} in {theirs}</span>
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
