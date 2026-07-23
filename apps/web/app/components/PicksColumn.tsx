"use client";

import type { Card } from "@mtg-tutor/core";
import { COLOR_NAMES, manaText } from "../lib/format";
import { useCardHover } from "./CardPreview";

function PickRow({ card }: { card: Card }) {
  const hover = useCardHover(card);
  return (
    <li
      className="flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-base-100"
      tabIndex={0}
      {...hover}
    >
      <span className="truncate">{card.name}</span>
      <span className="shrink-0 font-mono text-xs text-base-content/60">
        {manaText(card.manaCost)}
      </span>
    </li>
  );
}

export function PicksColumn({ pool }: { pool: Card[] }) {
  // Copy before sorting -- state.pool is shared React state and must not be
  // mutated. Ascending mana value, name as the tie-break.
  const picks = [...pool].sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));

  const colors = new Map<string, number>();
  for (const c of pool) for (const col of c.colors) colors.set(col, (colors.get(col) ?? 0) + 1);

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

        {picks.length === 0 ? (
          <p className="text-sm text-base-content/60">Nothing drafted yet.</p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {picks.map((card, i) => (
              <PickRow key={`${card.name}-${i}`} card={card} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
