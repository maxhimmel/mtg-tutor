"use client";

import { type Card, cardTypes, creatureTypes, tally } from "@mtg-tutor/core";
import { ringFor } from "../lib/cardFrame";
import { COLOR_NAMES } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { ManaCurve } from "./ManaCurve";
import { Panel } from "./Panel";

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
      <ManaCurve cards={pool} />

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

      {picks.length === 0 ? (
        <p className="text-sm text-base-content/60">Nothing drafted yet.</p>
      ) : (
        <CardPlacardList cards={picks} className="max-h-[60vh] overflow-y-auto pr-1" />
      )}
    </Panel>
  );
}
