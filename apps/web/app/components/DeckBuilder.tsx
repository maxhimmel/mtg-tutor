"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { type Bench, type Card, DECK, buildDeck } from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { ringFor } from "../lib/cardFrame";
import { COLOR_NAMES, pct } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { ManaCurve } from "./ManaCurve";
import { Panel } from "./Panel";

const byCurve = (a: { card: Card }, b: { card: Card }) =>
  a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name);

function MoveButton({
  card,
  benched,
  onClick,
}: {
  card: Card;
  benched: boolean;
  onClick: () => void;
}) {
  const label = benched ? `Play ${card.name}` : `Cut ${card.name}`;
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
        className={`size-3.5 ${benched ? "rotate-180" : ""}`}
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
 * The 40, built by the person who drafted it.
 *
 * The cards are the same maindeck/sideboard split the draft screen has been
 * writing since pick one, edited through the same `bench` mutation -- so
 * finishing a draft does not start a second deck somewhere else. The land count
 * is the only thing this screen adds, because it is the only part of a 40 that
 * is not a pick.
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
  const benched = new Set(current.map((b) => b.pos));

  const move = async (pickIndex: number, cut: boolean) => {
    const next = cut
      ? [...current.filter((b) => b.pos !== pickIndex), { pos: pickIndex, atPick: pool.length }]
      : current.filter((b) => b.pos !== pickIndex);
    setPending(next.sort((a, b) => a.pos - b.pos));
    try {
      setPending(await bench({ sessionId, pickIndex, benched: cut }));
    } catch {
      setPending(null);
    }
  };

  const picks = pool.map((card, pickIndex) => ({ card, pickIndex }));
  const playing = picks.filter((p) => !benched.has(p.pickIndex)).sort(byCurve);
  const cut = picks.filter((p) => benched.has(p.pickIndex)).sort(byCurve);

  const deck = buildDeck(
    playing.map((p) => p.card),
    basicLands,
  );

  const colors = new Map<string, number>();
  for (const c of deck.spells) for (const col of c.colors) colors.set(col, (colors.get(col) ?? 0) + 1);

  const trailingFor = (list: { pickIndex: number }[], isCut: boolean) => (card: Card, i: number) => (
    <span className="flex items-center gap-2">
      <span className="tabular-nums text-base-content/45">{pct(card.gihWinRate)}</span>
      <MoveButton card={card} benched={isCut} onClick={() => move(list[i].pickIndex, !isCut)} />
    </span>
  );

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Panel
        title={`Playing (${deck.spells.length + deck.nonbasicLands.length})`}
        aside={
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {[...colors]
              .sort((a, b) => b[1] - a[1])
              .map(([color, n]) => (
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
                </span>
              ))}
          </div>
        }
      >
        <ManaCurve cards={deck.spells} />
        {playing.length === 0 ? (
          <p className="text-sm text-base-content/60">Every card is cut.</p>
        ) : (
          <CardPlacardList
            cards={playing.map((p) => p.card)}
            trailing={trailingFor(playing, false)}
          />
        )}
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="Lands" bodyClassName="gap-3">
          <LandStepper
            value={basicLands}
            drafted={deck.nonbasicLands.length}
            onChange={setBasicLands}
          />
        </Panel>

        <Panel bodyClassName="gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-base-content/60">Deck</span>
            <span
              className={`font-display text-2xl font-semibold tabular-nums ${
                deck.size === DECK.size ? "text-success" : "text-base-content/50"
              }`}
            >
              {deck.size}
              <span className="text-sm font-normal text-base-content/45">/{DECK.size}</span>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={deck.size !== DECK.size || locking}
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
            {locking ? "Locking in…" : "Lock in the 40"}
          </button>
          <p className="text-xs text-base-content/50">
            {deck.size === DECK.size
              ? "Then you get to see what the numbers would have built."
              : deck.size > DECK.size
                ? `Cut ${deck.size - DECK.size} more, or play fewer lands.`
                : `${DECK.size - deck.size} short — play more cards, or more lands.`}
          </p>
        </Panel>

        <Panel title={`Cut (${cut.length})`}>
          {cut.length === 0 ? (
            <p className="rounded-box border border-dashed border-base-content/25 px-3 py-5 text-center text-sm text-base-content/60">
              Nothing cut yet. A 40 is roughly {DECK.spellCount} spells and{" "}
              {DECK.size - DECK.spellCount} lands.
            </p>
          ) : (
            <CardPlacardList
              cards={cut.map((p) => p.card)}
              trailing={trailingFor(cut, true)}
              className="opacity-70"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

// Basics are not picks, so there is nothing in the pool to move -- you are
// handed as many as you want. The stepper is the whole of that decision.
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold leading-none tabular-nums">
          {value + drafted}
        </span>
        <span className="text-sm text-base-content/50">
          lands{drafted > 0 && ` (${drafted} drafted + ${value} basic)`}
        </span>
      </div>
      <div className="join">
        <button
          type="button"
          className="btn btn-sm join-item"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label="One fewer basic land"
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-sm join-item"
          onClick={() => onChange(Math.min(DECK.size, value + 1))}
          aria-label="One more basic land"
        >
          +
        </button>
      </div>
    </div>
  );
}
