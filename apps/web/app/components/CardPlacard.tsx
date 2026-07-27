"use client";

import type { ReactNode } from "react";
import type { Card } from "@mtg-tutor/core";
import { frameFor } from "../lib/cardFrame";
import { useCardHover } from "./CardPreview";
import { ManaCost } from "./ManaCost";

// The placard across the top of a printed Magic card: the name on the left, the
// mana cost on the right. Two nested boxes, which is the thing that makes it read
// as a card -- a saturated frame band, and inside it a plate that is nearly white
// and only faintly tinted by the card's colour. Filling the whole bar with the
// frame colour is what made the first attempt look like a stack of colour blocks.
//
// Rebuilt in CSS rather than cropped out of the card image. The image would be
// exact for bespoke frames, but this stays crisp at any size, keeps the name as
// real selectable text for screen readers, and costs no request -- which matters
// when a finished pool stacks 45 of these in one scrolling column.
//
// Proportions are scaled off a 672px-wide scan, where the plate measures 586x51:
// corner radius is 0.37 of the plate's height, the name's inset 0.3 of it, and the
// frame band around it about a sixth of it.
export function CardPlacard({ card, className }: { card: Card; className?: string }) {
  const frame = frameFor(card);

  return (
    <div
      className={`rounded-[11px] border border-[#0d0d0d] p-0.75 ${className ?? ""}`}
      style={{ background: frame.band }}
    >
      <div
        className="placard-plate flex items-center justify-between gap-2 rounded-lg border px-2 py-0.75"
        style={{
          background: `linear-gradient(to bottom, ${frame.plateTop}, ${frame.plateBottom})`,
          borderColor: frame.stroke,
          // The highlight along the plate's top edge, and the shadow it casts down
          // onto the frame band.
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.45)",
        }}
      >
        <span
          className="truncate font-serif text-[13px] font-semibold leading-5 tracking-tight text-[#12100e]"
          title={card.name}
        >
          {card.name}
        </span>
        <ManaCost cost={card.manaCost} shadow className="shrink-0 whitespace-nowrap text-[11px]" />
      </div>
    </div>
  );
}

function PlacardRow({ card, trailing }: { card: Card; trailing?: ReactNode }) {
  const hover = useCardHover(card);
  return (
    <li className="flex items-center gap-3">
      <div
        className="min-w-0 flex-1 cursor-default rounded-[11px] outline-offset-2 focus-visible:outline focus-visible:outline-primary motion-safe:transition-transform motion-safe:hover:-translate-y-px"
        tabIndex={0}
        {...hover}
      >
        <CardPlacard card={card} />
      </div>
      {trailing != null && (
        <span className="shrink-0 text-sm tabular-nums text-base-content/60">{trailing}</span>
      )}
    </li>
  );
}

// The reusable way to show cards as a condensed vertical list. `trailing` puts
// per-card extras in a gutter beside the placard rather than inside it, so the
// placard itself stays exactly the name and cost the printed one carries.
export function CardPlacardList({
  cards,
  trailing,
  className,
}: {
  cards: Card[];
  trailing?: (card: Card, index: number) => ReactNode;
  className?: string;
}) {
  return (
    <ul className={`flex flex-col gap-1 ${className ?? ""}`}>
      {/* Keyed by position, not name: drafting two copies of the same card is
          normal, so names are not unique in a pool. */}
      {cards.map((card, i) => (
        <PlacardRow key={`${card.name}-${i}`} card={card} trailing={trailing?.(card, i)} />
      ))}
    </ul>
  );
}
