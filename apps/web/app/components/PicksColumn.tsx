"use client";

import { type Card, cardTypes, creatureTypes, tally } from "@mtg-tutor/core";
import { COLOR_NAMES } from "../lib/format";
import { CardPlacard } from "./CardPlacard";
import { useCardHover } from "./CardPreview";

function PickRow({ card }: { card: Card }) {
  const hover = useCardHover(card);
  return (
    <li
      className="cursor-default rounded-md outline-offset-2 focus:outline focus:outline-primary"
      tabIndex={0}
      {...hover}
    >
      <CardPlacard
        card={card}
        className="transition-transform hover:-translate-y-px hover:brightness-105"
      />
    </li>
  );
}

// Enough to see what the deck is becoming without turning the panel into a
// wall of one-off tribes; the rest stay in the tooltip.
const TOP_CREATURE_TYPES = 6;

export function PicksColumn({ pool }: { pool: Card[] }) {
  // Copy before sorting -- state.pool is shared React state and must not be
  // mutated. Ascending mana value, name as the tie-break.
  const picks = [...pool].sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));

  const colors = new Map<string, number>();
  for (const c of pool) for (const col of c.colors) colors.set(col, (colors.get(col) ?? 0) + 1);

  const types = tally(pool, cardTypes);
  const tribes = tally(pool, creatureTypes);
  const asCounts = (counts: [string, number][]) => counts.map(([n, c]) => `${n} ${c}`).join(" · ");

  return (
    <div className="card border border-base-300 bg-base-200">
      <div className="card-body gap-2 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
            Picks ({pool.length})
          </h2>
          <div className="flex flex-wrap gap-1">
            {[...colors]
              .sort((a, b) => b[1] - a[1])
              .map(([color, n]) => (
                <span key={color} className="badge badge-sm badge-ghost font-normal">
                  {COLOR_NAMES[color] ?? color} {n}
                </span>
              ))}
          </div>
        </div>

        {types.length > 0 && (
          <div className="flex flex-col gap-1.5 border-b border-base-300 pb-2">
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

        {picks.length === 0 ? (
          <p className="text-sm text-base-content/60">Nothing drafted yet.</p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
            {picks.map((card, i) => (
              <PickRow key={`${card.name}-${i}`} card={card} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
