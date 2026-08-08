"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  type Bench,
  type Card,
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
import { ringFor } from "../lib/cardFrame";
import { COLOR_NAMES, pct } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { ManaCurve } from "./ManaCurve";
import { Panel } from "./Panel";

function MoveButton({ card, cut, onClick }: { card: Card; cut: boolean; onClick: () => void }) {
  // The button names the pile the card lands in, which is the rule the draft
  // screen's confirm bar already works to.
  const label = cut ? `Play ${card.name}` : `Cut ${card.name}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="btn btn-square btn-ghost btn-xs text-base-content/35 hover:text-base-content"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={`size-3.5 ${cut ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 2.5v6.5m0 0 2.75-2.75M8 9 5.25 6.25" />
        <path d="M2.75 12.75h10.5" />
      </svg>
    </button>
  );
}

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
 */
export function DeckBuilder({
  sessionId,
  pool,
  sideboard,
  onBuilt,
}: {
  sessionId: Id<"draftSessions">;
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

  const move = async (pickIndex: number, cut: boolean) => {
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

  const trailingFor = (list: { pos: number }[], isCut: boolean) => (card: Card, i: number) => (
    <span className="flex items-center gap-2">
      <span className="tabular-nums text-base-content/45">{pct(card.gihWinRate)}</span>
      <MoveButton card={card} cut={isCut} onClick={() => move(list[i].pos, !isCut)} />
    </span>
  );

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel
          title={`Playing (${deck.spells.length + deck.nonbasicLands.length})`}
          aside={
            // The one place in the chrome that carries Magic's colours, earned
            // here for the reason it is earned during the draft: which colours
            // the deck is in is the question this panel answers.
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {colors.map(([color, n]) => (
                <span
                  key={color}
                  className="flex items-center gap-1.5 text-xs tabular-nums text-base-content/70"
                  title={COLOR_NAMES[color] ?? color}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full ring-1 ring-black/40"
                    style={{ background: ringFor(color) }}
                  />
                  {n}
                  <span className="sr-only">{COLOR_NAMES[color] ?? color}</span>
                </span>
              ))}
            </div>
          }
        >
          <ManaCurve cards={deck.spells} />
          {playing.length === 0 ? (
            <p className="text-sm text-base-content/60">
              Everything is cut. Move a card back to start a deck.
            </p>
          ) : (
            // Both piles are far wider than a placard, so they wrap into as many
            // columns as they fit rather than stretching one. A forty read down a
            // single column is also just longer than it needs to be.
            <CardPlacardList
              cards={playing.map((p) => p.card)}
              trailing={trailingFor(playing, false)}
              columns
            />
          )}
        </Panel>

        <Panel title={`Cut (${cut.length})`}>
          {cut.length === 0 ? (
            <p className="rounded-box border border-dashed border-base-content/25 px-3 py-6 text-center text-sm text-base-content/60">
              Cut the cards you are not playing. Forty-five went into the pool and forty come out.
            </p>
          ) : (
            <CardPlacardList
              cards={cut.map((p) => p.card)}
              trailing={trailingFor(cut, true)}
              columns
              className="opacity-70"
            />
          )}
        </Panel>
      </div>

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
            onChange={setBasicLands}
          />

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!isLegalDeck(deck) || locking}
            onClick={async () => {
              setLocking(true);
              try {
                await lockIn({ sessionId, basicLands });
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
