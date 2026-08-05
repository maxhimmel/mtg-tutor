"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  type Bench,
  type Card,
  cardTypes,
  castingValue,
  creatureTypes,
  tally,
} from "@mtg-tutor/core";
import { ringFor } from "../lib/cardFrame";
import { COLOR_NAMES } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { ManaCurve } from "./ManaCurve";
import { Panel } from "./Panel";

// Enough to see what the deck is becoming without turning the panel into a
// wall of one-off tribes; the rest stay in the tooltip.
const TOP_CREATURE_TYPES = 6;

// A pick and where it sits in the draft. The position is what benching is keyed
// on -- two copies of the same card are two different picks -- so it has to
// survive the sort into curve order.
interface Pick {
  card: Card;
  pickIndex: number;
}

const byCurve = (a: Pick, b: Pick) =>
  castingValue(a.card) - castingValue(b.card) || a.card.name.localeCompare(b.card.name);

// The two piles, as places to put a card rather than as lists of one. A section
// wearing a card is where it will land; the wash and the ring are the same gold
// a card takes when it is pulled out of the pack, because it is the same
// statement about the same card.
const zoneClass = (over: boolean) =>
  `rounded-box motion-safe:transition-colors ${
    over ? "bg-primary/10 ring-1 ring-primary/50 ring-inset" : ""
  }`;

const eyebrowClass = (over: boolean, offered: boolean) =>
  `eyebrow ${over ? "text-primary" : offered ? "text-base-content" : "text-base-content/50"}`;

function BenchButton({
  card,
  benched,
  onClick,
}: {
  card: Card;
  benched: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={benched ? `Move ${card.name} back into the deck` : `Move ${card.name} to the sideboard`}
      aria-label={
        benched ? `Move ${card.name} back into the deck` : `Move ${card.name} to the sideboard`
      }
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

export function PicksColumn({
  pool,
  sideboard,
  onBench,
  offering = false,
}: {
  pool: Card[];
  // Positions in `pool`, which is the pool in pick order — see the field's note
  // in the backend schema. The panel only asks whether a card is set aside, not
  // when, so it reads `pos` and ignores the clock.
  sideboard: Bench[];
  onBench: (pickIndex: number, benched: boolean) => void;
  // A card is being carried, so this panel is offering somewhere to put it
  // rather than reporting what is already in it.
  //
  // Passed in rather than read from useDndContext: that context carries the
  // measured rectangles of every drop zone and changes on every frame of a drag,
  // and this panel renders up to forty-five rows.
  offering?: boolean;
}) {
  // The section wrapper, not the list inside it: the list scrolls, and a box
  // whose rectangle moves as its contents scroll is not where a card was aimed.
  const main = useDroppable({ id: "maindeck", data: { bench: false } });
  const side = useDroppable({ id: "sideboard", data: { bench: true } });

  const benched = new Set(sideboard.map((b) => b.pos));
  const picks = pool.map((card, pickIndex) => ({ card, pickIndex }));

  // Ascending mana value, name as the tie-break. Copied before sorting -- the
  // pool is shared React state and must not be mutated.
  const maindeck = picks.filter((p) => !benched.has(p.pickIndex)).sort(byCurve);
  const bench = picks.filter((p) => benched.has(p.pickIndex)).sort(byCurve);

  // Everything the panel counts, counts the deck being built. Cards in the
  // sideboard are cards the player has said they are not playing, so leaving
  // them in the colour tally would keep claiming a colour they have dropped --
  // which is exactly what the coach is being told to stop doing.
  const deck = maindeck.map((p) => p.card);

  const colors = new Map<string, number>();
  for (const c of deck) for (const col of c.colors) colors.set(col, (colors.get(col) ?? 0) + 1);

  const types = tally(deck, cardTypes);
  const tribes = tally(deck, creatureTypes);
  const asCounts = (counts: [string, number][]) => counts.map(([n, c]) => `${n} ${c}`).join(" · ");

  const trailingFor = (list: Pick[], isBenched: boolean) => (card: Card, i: number) => (
    <BenchButton
      card={card}
      benched={isBenched}
      onClick={() => onBench(list[i].pickIndex, !isBenched)}
    />
  );

  return (
    <Panel
      title={`Picks (${pool.length})`}
      aside={
        // The one place in the chrome that carries Magic's colours, and it is
        // earned: which colours you are in is the question this panel answers,
        // and each swatch is the exact ring painted on the cards it counts.
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
                <span className="sr-only">{COLOR_NAMES[color] ?? color}</span>
              </span>
            ))}
        </div>
      }
    >
      {/* Above the counts, because it answers a question they cannot: the tally
          says what the pool is made of, the curve says when it can play it. */}
      <ManaCurve cards={deck} />

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

      {/* Labelled like the sideboard below it, because since benching shipped
          the panel's title counts both and neither number could be read off the
          other. The title is what you have drafted; this is what you are
          playing, which is the one the tallies above already describe. */}
      <div ref={main.setNodeRef} className={`flex flex-col gap-1.5 p-1.5 ${zoneClass(main.isOver)}`}>
        <div className={eyebrowClass(main.isOver, offering)}>Maindeck ({maindeck.length})</div>
        {maindeck.length === 0 ? (
          <p className="text-sm text-base-content/60">
            {picks.length === 0 ? "Nothing drafted yet." : "Every pick is in the sideboard."}
          </p>
        ) : (
          <CardPlacardList
            cards={deck}
            trailing={trailingFor(maindeck, false)}
            className="max-h-[45vh] overflow-y-auto pr-1"
          />
        )}
      </div>

      {/* Empty, this section is nothing to read -- but it is somewhere to put a
          card, so a drag brings it out even on the first pick of a draft. */}
      {(bench.length > 0 || offering) && (
        <div className="border-t border-base-300 pt-2.5">
          <div
            ref={side.setNodeRef}
            className={`flex flex-col gap-1.5 p-1.5 ${zoneClass(side.isOver)}`}
          >
            <div className={eyebrowClass(side.isOver, offering)}>Sideboard ({bench.length})</div>
            {bench.length === 0 ? (
              <p className="rounded-box border border-dashed border-base-content/25 px-3 py-5 text-center text-sm text-base-content/60">
                Drop here to take it without playing it
              </p>
            ) : (
              // Dimmed rather than hidden: these are still yours, and a card you
              // benched early is the one you most need to see when the lane you
              // left starts coming back. Full strength while a card is being
              // carried, because then it is a destination and not a footnote.
              <CardPlacardList
                cards={bench.map((p) => p.card)}
                trailing={trailingFor(bench, true)}
                className={`max-h-[25vh] overflow-y-auto pr-1 motion-safe:transition-opacity ${
                  offering ? "" : "opacity-60"
                }`}
              />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
