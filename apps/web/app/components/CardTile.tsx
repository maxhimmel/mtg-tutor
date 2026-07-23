"use client";

import type { Card } from "@mtg-tutor/core";
import { pct } from "../lib/format";
import { useSettings } from "../lib/useSettings";
import { useCardHover, useHidePreview } from "./CardPreview";

export function CardTile({
  card,
  onPick,
  disabled,
}: {
  card: Card;
  onPick: (card: Card) => void;
  disabled?: boolean;
}) {
  const { settings } = useSettings();
  const hover = useCardHover(card);
  const hidePreview = useHidePreview();
  const rate = card.gihWinRate != null ? pct(card.gihWinRate) : card.rarity[0].toUpperCase();

  return (
    <button
      type="button"
      className="card-aspect group relative block w-full overflow-hidden rounded-xl border border-transparent bg-transparent p-0 transition hover:-translate-y-1 hover:border-primary hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => {
        hidePreview();
        onPick(card);
      }}
      disabled={disabled}
      aria-label={`Pick ${card.name}`}
      {...hover}
    >
      {card.imageUrl ? (
        // Plain <img>: Scryfall already serves an appropriately sized "normal"
        // image, so next/image's optimizer would add cost without benefit.
        <img
          src={card.imageUrl}
          alt={card.name}
          loading="lazy"
          className="h-full w-full rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-full w-full flex-col justify-between rounded-xl border border-base-300 bg-base-200 p-3 text-left">
          <span className="text-sm font-semibold">{card.name}</span>
          <span className="text-xs text-base-content/60">{card.typeLine}</span>
        </span>
      )}

      {settings.guiderails && (
        <span className="badge badge-sm absolute bottom-1.5 right-1.5 border-base-300 bg-base-100/90 font-mono text-base-content/80">
          {rate}
        </span>
      )}
    </button>
  );
}
