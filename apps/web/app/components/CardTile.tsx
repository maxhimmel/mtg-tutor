"use client";

import type { Card } from "@mtg-tutor/core";
import { pct } from "../lib/format";

export function CardTile({
  card,
  onPick,
  disabled,
}: {
  card: Card;
  onPick: (card: Card) => void;
  disabled?: boolean;
}) {
  const rate = card.gihWinRate != null ? pct(card.gihWinRate) : card.rarity[0].toUpperCase();

  return (
    <button
      className="card"
      onClick={() => onPick(card)}
      disabled={disabled}
      title={`${card.name} — ${card.typeLine}`}
      aria-label={`Pick ${card.name}`}
    >
      {card.imageUrl ? (
        // Plain <img>: Scryfall already serves an appropriately sized "normal"
        // image, so next/image's optimizer would add cost without benefit.
        <img src={card.imageUrl} alt={card.name} loading="lazy" />
      ) : (
        <span className="noart">
          <span className="nm">{card.name}</span>
          <span className="tl">{card.typeLine}</span>
        </span>
      )}
      <span className="rate">{rate}</span>
    </button>
  );
}
