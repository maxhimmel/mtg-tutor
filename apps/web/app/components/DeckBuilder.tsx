"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  type Bench,
  type Card,
  type DeckPick,
  DECK,
  applyBench,
  buildDeck,
  deckPiles,
  deckSizeNote,
  isLandCount,
  isLegalDeck,
  tally,
} from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../lib/format";
import { deckShaped } from "../lib/analytics";
import { CardPlacard } from "./CardPlacard";
import { ColorTally } from "./ColorPips";
import { LANDS_PILE, PILE_LABELS, PileGrid, PileWell, pileUp } from "./CurvePiles";
import { Panel } from "./Panel";

/**
 * Forty slots, drawn as forty cards.
 *
 * A Limited deck is exactly forty cards and the whole of building one is
 * counting down to that, so the count is this screen's instrument rather than a
 * number in a corner. Discrete marks rather than a progress bar, because the
 * question is how many slots are LEFT -- and the split between spells and lands
 * then comes for free in the same picture.
 *
 * The deck turns gold the moment it is a legal forty, in the light this app
 * already uses for the card you are holding. It is the same statement -- this is
 * the live thing -- and it means you can stop counting without reading a number.
 */
function DeckSlots({ spells, lands, size }: { spells: number; lands: number; size: number }) {
  const full = size === DECK.size;
  const fill = (i: number) => {
    if (i < spells) return full ? "bg-primary" : "bg-base-content/70";
    if (i < spells + lands) return full ? "bg-primary/45" : "bg-base-content/25";
    return "border border-base-content/20";
  };

  return (
    <div
      role="img"
      aria-label={`${size} of ${DECK.size} cards: ${spells} spells, ${lands} lands`}
      className="grid w-[13rem] shrink-0 grid-cols-[repeat(20,minmax(0,1fr))] gap-[2px]"
    >
      {Array.from({ length: DECK.size }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`card-aspect rounded-[1px] motion-safe:transition-colors ${fill(i)}`}
        />
      ))}
    </div>
  );
}

/**
 * The forty, built by the person who drafted it.
 *
 * The cards are the same maindeck/sideboard split the draft screen has been
 * writing since pick one, edited through the same `bench` mutation -- so
 * finishing a draft does not start a second deck somewhere else. The land count
 * is the only thing this screen adds, because it is the only part of a forty
 * that is not a pick.
 *
 * Laid out in the curve wells the results board uses, and that is the whole of
 * this screen's second draft. It was two panels side by side -- Playing and Cut
 * -- each wrapping its cards into as many natural-width columns as it fit. Both
 * lists were in curve order and both were read ACROSS then down, so a one-drop
 * sat beside a five-drop on every row and the order looked like no order at all.
 * A deck is laid out in piles by mana cost on every table and in every client,
 * and this app already draws that picture one click later.
 *
 * So the piles are the instrument here too, and the cut cards sit under a rule
 * inside the pile they came from rather than in a panel of their own. The
 * question being answered at a well is "what have I got at three mana" -- the
 * cards you are playing, and directly beneath them the ones you are not. A
 * separate column could not answer it without you holding two places at once.
 *
 * The mana curve chart above the piles goes, for the reason the results board
 * dropped its own: the piles ARE the curve, and a bar chart over a board whose
 * column heights say the same thing is two pictures of one fact.
 */
export function DeckBuilder({
  sessionId,
  setCode,
  format,
  pool,
  sideboard,
  onBuilt,
}: {
  sessionId: Id<"draftSessions">;
  // Carried only so `deck_shaped` can stand on its own rather than needing a
  // join against `draft_started` to say which format was being built for.
  setCode: string;
  format: string;
  pool: Card[];
  sideboard: Bench[];
  onBuilt: () => void;
}) {
  const bench = useMutation(api.draft.bench);
  const lockIn = useMutation(api.draft.build);
  const [pending, setPending] = useState<Bench[] | null>(null);
  // The convention, offered as the thing to disagree with rather than as the
  // answer -- nothing we have ingested says what a winning deck really runs.
  const [basicLands, setBasicLands] = useState(DECK.size - DECK.spellCount);
  const [locking, setLocking] = useState(false);

  // Optimistic, because moving a card between two piles should feel like moving
  // a card and not like asking a server whether it may be moved. Reconciled with
  // what the mutation returns, and dropped back to the query's copy on failure.
  const current = pending ?? sideboard;

  // Counted rather than derived from the final split, because the two are not
  // the same number: cutting a card and putting it back is two presses and no
  // difference, and "did anybody work at this" is a question about the presses.
  const worked = useRef({ cuts: 0, plays: 0, landSteps: 0 });

  const move = async (pickIndex: number, cut: boolean) => {
    if (cut) worked.current.cuts++;
    else worked.current.plays++;
    setPending(applyBench(current, pickIndex, cut, pool.length));
    try {
      setPending(await bench({ sessionId, pickIndex, benched: cut }));
    } catch {
      setPending(null);
    }
  };

  const { maindeck: playing, sideboard: cut } = deckPiles(pool, current);

  const deck = buildDeck(
    playing.map((p) => p.card),
    basicLands,
  );
  const lands = deck.nonbasicLands.length + deck.basicLands;
  const shortfall = deckSizeNote(deck);
  const colors = tally(deck.spells, (c) => c.colors);

  const playingPiles = pileUp(playing, (p) => p.card);
  const cutPiles = pileUp(cut, (p) => p.card);

  return (
    <>
      <Panel
        title="Your forty"
        aside={
          // The one place in the chrome that carries Magic's colours, earned here
          // for the reason it is earned during the draft: which colours the deck
          // is in is the question this panel answers.
          <ColorTally colors={colors} />
        }
        bodyClassName="gap-3"
      >
        {/* The one instruction the board needs, and it earns its line: a placard
            has never been pressable anywhere else in the app. */}
        <p className="text-sm text-base-content/60">
          Press a card to move it between the deck and the sideboard. Forty-five went into the
          pool and forty come out.
        </p>

        <PileGrid gutter>
          {PILE_LABELS.map((pile, i) => (
            <PileWell
              key={pile.label}
              label={pile.label}
              spoken={pile.spoken}
              aside={
                <span
                  className={`text-xs tabular-nums ${
                    playingPiles[i].length === 0 ? "text-base-content/30" : "text-base-content/70"
                  }`}
                >
                  {playingPiles[i].length}
                  <span className="sr-only"> playing</span>
                </span>
              }
            >
              {playingPiles[i].length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {playingPiles[i].map((pick) => (
                    <BuildRow key={pick.pos} pick={pick} cut={false} onMove={move} />
                  ))}
                </ul>
              )}

              {i === LANDS_PILE && basicLands > 0 && (
                <p className="text-xs tabular-nums text-base-content/45">
                  + {basicLands} basic{basicLands === 1 ? "" : "s"}
                </p>
              )}

              {/* The cut cards and the rule naming them, as ONE box on the floor
                  of the well.

                  Both parts matter. `mt-auto` puts it on the floor because the
                  wells are grid items stretched to the tallest, so a rule that
                  simply follows the last card you are playing sits at a different
                  height in all seven columns -- seven dashed lines at seven
                  heights, none of which is a boundary you can run an eye along.
                  On the floor they read as one line across the board, and the
                  slack falls in the middle where it says something true: there is
                  room at this cost.

                  The wrapper is what makes the rule stay ON the cards. As two
                  loose children of the well they were two flex items, and an auto
                  margin on the first of them is a rule the layout is free to
                  honour by moving one and not the other -- which is exactly what
                  it did, stranding the label at the top with its cards at the
                  bottom. One box cannot come apart. */}
              {cutPiles[i].length > 0 && (
                <div className="mt-auto flex flex-col gap-1.5">
                  {/* Dashed, because the cards under it are drawn with a dashed
                      plate and mean the same thing there: not in your forty. */}
                  <p className="eyebrow border-t border-dashed border-base-300 pt-1.5 text-base-content/35">
                    Cut
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {cutPiles[i].map((pick) => (
                      <BuildRow key={pick.pos} pick={pick} cut onMove={move} />
                    ))}
                  </ul>
                </div>
              )}
            </PileWell>
          ))}
        </PileGrid>
      </Panel>

      {/* Where the draft screen puts its confirm bar, because it is the same
          kind of thing: the deck as it stands, and the one action on it. */}
      <div className="sticky bottom-4 z-20 mt-4 flex justify-center">
        <div className="popup-surface flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 py-3">
          <DeckSlots spells={deck.spells.length} lands={lands} size={deck.size} />

          <span className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-2xl font-semibold leading-none tabular-nums ${
                shortfall === null ? "text-primary" : ""
              }`}
            >
              {deck.size}
            </span>
            <span className="text-sm tabular-nums text-base-content/45">/{DECK.size}</span>
            {shortfall && <span className="text-xs text-base-content/60">{shortfall}</span>}
          </span>

          <LandStepper
            value={basicLands}
            drafted={deck.nonbasicLands.length}
            onChange={(n) => {
              worked.current.landSteps++;
              setBasicLands(n);
            }}
          />

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!isLegalDeck(deck) || locking}
            onClick={async () => {
              setLocking(true);
              try {
                await lockIn({ sessionId, basicLands });
                // After the write, so a forty that never made it to the server
                // is not reported as one somebody built.
                const { cuts, plays, landSteps } = worked.current;
                deckShaped({
                  sessionId,
                  setCode,
                  format,
                  moves: cuts + plays,
                  cuts,
                  plays,
                  landSteps,
                  basicLands,
                  benched: cut.length,
                });
                onBuilt();
              } finally {
                setLocking(false);
              }
            }}
          >
            {locking ? "Locking in…" : "Lock in the forty"}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * One card in a well, and the win rate you are weighing it on.
 *
 * The number rides in a gutter beside the placard rather than inside it, which is
 * the rule everywhere placards are listed: a placard is exactly the name and cost
 * the printed card carries. It survived the move to piles because THIS screen is
 * where it earns its place -- the results board can drop it, since by then the
 * argument is the suggestion rather than a column of percentages, but cutting
 * twenty-two cards without them is guesswork.
 */
function BuildRow({
  pick,
  cut,
  onMove,
}: {
  pick: DeckPick<Card>;
  cut: boolean;
  onMove: (pos: number, cut: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <CardPlacard
        card={pick.card}
        ghost={cut}
        // Named for the pile the card lands in, which is the rule the draft
        // screen's confirm bar already works to.
        label={cut ? `Play ${pick.card.name}` : `Cut ${pick.card.name}`}
        onClick={() => onMove(pick.pos, !cut)}
        className="min-w-0 flex-1"
      />
      {/* A fixed width, and the reason is the basic lands. 17Lands rates nothing
          you are handed for free, so `pct` renders an em dash for them -- one
          character against the five of "56.3%" -- and with the gutter sized to
          its content the placard beside it took the difference and grew. A well
          of cards where the unrated ones are visibly longer than the rest reads
          as a rendering fault, which it was. Wide enough for "100.0%", right
          aligned so the decimal points line up down the well. */}
      <span
        className={`w-10 shrink-0 text-right text-[11px] tabular-nums ${
          cut ? "text-base-content/25" : "text-base-content/45"
        }`}
      >
        {pct(pick.card.gihWinRate)}
      </span>
    </li>
  );
}

// Basics are not picks, so there is nothing in the pool to move -- you are
// handed as many as you want. The stepper is the whole of that decision, and it
// reads out total lands rather than basics because that is the number a deck is
// described by.
function LandStepper({
  value,
  drafted,
  onChange,
}: {
  value: number;
  drafted: number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm tabular-nums text-base-content/70">
        {value + drafted} land{value + drafted === 1 ? "" : "s"}
        {drafted > 0 && <span className="text-base-content/45"> ({drafted} drafted)</span>}
      </span>
      <span className="join">
        <button
          type="button"
          className="btn btn-xs join-item"
          disabled={!isLandCount(value - 1)}
          onClick={() => onChange(value - 1)}
          aria-label="One fewer basic land"
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-xs join-item"
          disabled={!isLandCount(value + 1)}
          onClick={() => onChange(value + 1)}
          aria-label="One more basic land"
        >
          +
        </button>
      </span>
    </span>
  );
}
