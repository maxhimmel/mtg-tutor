"use client";

import type { Card } from "@mtg-tutor/core";
import { pct, points } from "../lib/format";

// The draft data for one card, as the hover panel shows it. Deliberately more
// than the win rate: GIH alone is confounded by the quality of the decks that
// played the card, and the rows under it are what make it readable -- IWD
// isolates the card's own contribution, and the maindeck rate says how
// self-selected the sample behind GIH was.

// Whether there is anything to draw. Callers need this before laying the panel
// out, since a card with no data and no keywords should get no panel at all.
export const hasStats = (c: Card): boolean =>
  c.gihWinRate != null ||
  c.iwd != null ||
  c.avgPick != null ||
  c.alsa != null ||
  c.maindeckRate != null ||
  c.winRate != null;

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      {/* title= is the pointer-less fallback: the panel itself is
          pointer-events:none, so there is nothing to long-press. */}
      <span className="text-xs text-base-content/60" title={hint}>
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}

export function CardStats({ card }: { card: Card }) {
  if (!hasStats(card)) return null;

  return (
    <div className="flex flex-col gap-1">
      {card.gihWinRate != null && (
        <Row
          label="GIH WR"
          hint="Win rate of games where this card was drawn. Reflects the decks that played it as much as the card."
          value={
            card.gihGames != null
              ? `${pct(card.gihWinRate)} (n ${card.gihGames.toLocaleString()})`
              : pct(card.gihWinRate)
          }
        />
      )}
      {card.iwd != null && (
        <Row
          label="IWD"
          hint="Improvement when drawn: the same decks' win rate with this card drawn, minus without it. Deck quality cancels out, so this is the card's own contribution."
          value={points(card.iwd)}
        />
      )}
      {(card.avgPick != null || card.alsa != null) && (
        <Row
          label="ATA / ALSA"
          hint="The mean pick it is taken at, and the mean pick drafters see it at. A wide gap means it survives the table and may wheel."
          value={`${card.avgPick?.toFixed(1) ?? "—"} / ${card.alsa?.toFixed(1) ?? "—"}`}
        />
      )}
      {card.maindeckRate != null && (
        <Row
          label="Maindecked"
          hint="Of the drafters who took it, how many played it. A low figure means the GIH WR above came from a self-selected sample."
          value={pct(card.maindeckRate)}
        />
      )}
      {card.winRate != null && (
        <Row
          label="GP WR"
          hint="Win rate of decks containing this card, drawn or not. The most deck-dominated number here."
          value={pct(card.winRate)}
        />
      )}
    </div>
  );
}
