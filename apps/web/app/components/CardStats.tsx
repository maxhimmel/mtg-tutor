"use client";

import type { DisplayCard } from "@mtg-tutor/core";
import { CARD_STAT_GLOSSARY } from "@mtg-tutor/core";
import { pct, points } from "../lib/format";

// The draft data for one card, as the hover panel shows it. Deliberately more
// than the win rate: GIH alone is confounded by the quality of the decks that
// played the card, and the rows under it are what make it readable -- IWD
// isolates the card's own contribution, and the maindeck rate says how
// self-selected the sample behind GIH was.
//
// Labels and explanations come from CARD_STAT_GLOSSARY, the same corpus behind
// the coach's system prompt and /glossary, so the three cannot drift.

const byId = new Map(CARD_STAT_GLOSSARY.map((s) => [s.id, s]));

// Which stats this card actually has, in glossary order. Returned as a list so
// the caller can ask "is there anything to draw?" without rendering.
function rowsFor(card: DisplayCard): { id: string; value: string }[] {
  const rows: { id: string; value: string }[] = [];

  if (card.gihWinRate != null) {
    rows.push({
      id: "gih",
      value:
        card.gihGames != null
          ? `${pct(card.gihWinRate)} (n ${card.gihGames.toLocaleString()})`
          : pct(card.gihWinRate),
    });
  }
  if (card.iwd != null) rows.push({ id: "iwd", value: points(card.iwd) });
  if (card.avgPick != null || card.alsa != null) {
    rows.push({
      id: "pick-order",
      value: `${card.avgPick?.toFixed(1) ?? "—"} / ${card.alsa?.toFixed(1) ?? "—"}`,
    });
  }
  if (card.maindeckRate != null) {
    rows.push({ id: "maindeck", value: pct(card.maindeckRate) });
  }
  if (card.winRate != null) rows.push({ id: "gpwr", value: pct(card.winRate) });

  return rows;
}

export const hasStats = (card: DisplayCard): boolean => rowsFor(card).length > 0;

export function CardStats({ card, expanded }: { card: DisplayCard; expanded?: boolean }) {
  const rows = rowsFor(card);
  if (rows.length === 0) return null;

  return (
    <div className={`flex flex-col ${expanded ? "gap-2.5" : "gap-1"}`}>
      {rows.map(({ id, value }) => {
        const def = byId.get(id);
        return (
          <div key={id}>
            <div className="flex items-baseline justify-between gap-3">
              {/* title= is the pointer-less fallback: the panel itself is
                  pointer-events:none, so there is nothing to long-press. */}
              <span className="text-xs text-base-content/60" title={def?.short}>
                {def?.label ?? id}
              </span>
              <span className="font-mono text-xs tabular-nums">{value}</span>
            </div>
            {expanded && def && (
              <p className="mt-0.5 text-[11px] leading-snug text-base-content/70">
                {def.short}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
