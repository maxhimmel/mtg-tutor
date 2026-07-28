"use client";

import type { Card } from "@mtg-tutor/core";
import { webpImage } from "../lib/cardImage";
import { pct } from "../lib/format";
import { useSettings } from "../lib/useSettings";
import { useCardHover, useHidePreview } from "./CardPreview";

// daisyUI's hover-3d reads the tilt direction from which of eight sibling hover
// zones the cursor is in -- a 3x3 grid minus the centre. They are part of the
// component's DOM contract, not spacing.
const TILT_ZONES = [0, 1, 2, 3, 4, 5, 6, 7];

export function CardTile({
  card,
  onPick,
  disabled,
  showRate,
  label,
}: {
  card: Card;
  onPick: (card: Card) => void;
  disabled?: boolean;
  // Overrides the guiderails setting when given. The review quiz passes false:
  // the badge is the card's win rate, which is the answer to the question the
  // quiz is asking.
  showRate?: boolean;
  // The accessible name defaults to "Pick <card>", which is a lie anywhere the
  // click is a guess rather than a pick.
  label?: string;
}) {
  const { settings } = useSettings();
  const hover = useCardHover(card);
  const hidePreview = useHidePreview();
  const rate = card.gihWinRate != null ? pct(card.gihWinRate) : card.rarity[0].toUpperCase();
  const withRate = showRate ?? settings.guiderails;

  return (
    <button
      type="button"
      className="hover-3d group w-full cursor-pointer bg-transparent p-0 perspective-midrange disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => {
        hidePreview();
        onPick(card);
      }}
      disabled={disabled}
      aria-label={label ?? `Pick ${card.name}`}
      {...hover}
    >
      {/* First child is the face that tilts; hover-3d clips it and applies the shine. */}
      <span className="card-aspect relative block w-full rounded-xl border border-transparent group-hover:border-primary">
        {card.imageUrl ? (
          // Plain <img>: Scryfall already serves an appropriately sized image,
          // so next/image's optimizer would add cost without benefit.
          <img src={webpImage(card.imageUrl)} alt={card.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col justify-between border border-base-300 bg-base-200 p-3 text-left">
            <span className="text-sm font-semibold">{card.name}</span>
            <span className="text-xs text-base-content/60">{card.typeLine}</span>
          </span>
        )}

        {withRate && (
          <span className="badge badge-sm absolute bottom-1.5 right-1.5 border-base-300 bg-base-100/90 font-mono text-base-content/80">
            {rate}
          </span>
        )}
      </span>

      {TILT_ZONES.map((i) => (
        <span key={i} aria-hidden className="block" />
      ))}
    </button>
  );
}
