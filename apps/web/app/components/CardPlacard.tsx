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
// Proportions come off the reference, where the ring is 74px tall: the ring band
// is 0.13 of that, the corner radius 0.3, and the type 0.57 -- which is why the
// plate hugs the name so tightly and the row reads as chunky rather than airy.
// Everything below is that ratio against a 30px row.
// Hovering or focusing one opens the same card preview the pack tiles and card
// names do. That lives here rather than on the list row because a placard is
// shown outside a list too -- the verdict stacks two of them -- and a row that
// previews next to one that does not is the kind of gap nobody notices until
// they reach for it.
export function CardPlacard({ card, className }: { card: Card; className?: string }) {
  const frame = frameFor(card);
  // Always with stats: a placard is a review, results or verdict row, and by then
  // the draft is over and the numbers are the thing being taught.
  const hover = useCardHover(card, true);

  return (
    <div
      className={`cursor-default rounded-[11px] outline-offset-2 focus-visible:outline focus-visible:outline-primary motion-safe:transition-transform motion-safe:hover:-translate-y-px ${className ?? ""}`}
      tabIndex={0}
      {...hover}
    >
      <div
        className="rounded-lg border border-[#0a0a0a] p-[3px]"
        style={{
          background: frame.ring,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="flex items-center justify-between gap-2 rounded-md border border-black/55 px-1.5"
          style={{
            background: `linear-gradient(to bottom, color-mix(in srgb, ${frame.plate} 88%, #fff), ${frame.plate})`,
            // The bright hairline the plate is drawn with, just inside its dark edge.
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5)",
          }}
        >
          {/* The app's display face, which is here for the same reason it is on
              headings: it is the closest licensable stand-in for Beleren, the
              face Magic prints card names in. */}
          <span
            className="truncate font-display text-[15px] font-bold leading-4.5 tracking-tight text-[#0d0b06]"
            title={card.name}
          >
            {card.name}
          </span>
          <ManaCost
            cost={card.manaCost}
            shadow
            className="shrink-0 whitespace-nowrap text-[11px]"
          />
        </div>
      </div>
    </div>
  );
}

function PlacardRow({ card, trailing }: { card: Card; trailing?: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <CardPlacard card={card} className="min-w-0 flex-1" />
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
    <ul className={`flex flex-col gap-0.5 ${className ?? ""}`}>
      {/* Keyed by position, not name: drafting two copies of the same card is
          normal, so names are not unique in a pool. */}
      {cards.map((card, i) => (
        <PlacardRow key={`${card.name}-${i}`} card={card} trailing={trailing?.(card, i)} />
      ))}
    </ul>
  );
}
