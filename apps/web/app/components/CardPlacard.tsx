"use client";

import type { ReactNode } from "react";
import type { Card } from "@mtg-tutor/core";
import { frameFor } from "../lib/cardFrame";
import { useCardHover } from "./CardPreview";
import { ManaCost } from "./ManaCost";

// The row Arena draws for a card in a deck list: a saturated ring in the card's
// colour, and inside it a plate of the same colour mixed toward white, carrying
// the name in black on the left and the mana cost on the right.
//
// Built in CSS rather than cropped out of the card image. The image would be
// exact, but this stays crisp at any size, keeps the name as real selectable text
// for screen readers, and costs no request -- which matters when a finished pool
// stacks 45 of these in one scrolling column.
//
// The colours are the reference's; the spacing deliberately is not. Arena draws
// this at 74px a row, where the plate hugs the name to about 1.1x the font size
// and the whole thing reads chunky. Scaled down to a pool of 45 in a narrow
// column that density turns cramped, so the plate keeps real padding, the type
// stays at reading size rather than filling the row, and the corners stay soft.
export function CardPlacard({ card, className }: { card: Card; className?: string }) {
  const frame = frameFor(card);

  return (
    <div
      className={`rounded-[11px] border border-[#0a0a0a] p-0.75 ${className ?? ""}`}
      style={{
        background: frame.ring,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 rounded-lg border border-black/55 px-2 py-0.75"
        style={{
          background: `linear-gradient(to bottom, color-mix(in srgb, ${frame.plate} 88%, #fff), ${frame.plate})`,
          // The bright hairline the plate is drawn with, just inside its dark edge.
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5)",
        }}
      >
        <span
          className="truncate font-serif text-[13px] font-semibold leading-5 tracking-tight text-[#0d0b06]"
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
