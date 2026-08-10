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

// The width this is drawn for, and a guardrail rather than a preference.
//
// The plate is supposed to hug the name -- that is the whole of why the row
// reads as a card. Stretched past about this, it becomes a long empty bar with a
// name marooned at one end and a mana cost at the other, and it stops reading as
// a card at all. The results and review pages each handed it `flex-1` in a
// container two to four times this wide, which is how a component designed for a
// side panel ended up looking like a progress bar. Every layout that shows
// placards is now a column of roughly this width, so nothing meets the cap; it
// is here to catch the next one that would.
const NATURAL_W = "max-w-[17rem]";

export function CardPlacard({
  card,
  ghost = false,
  onClick,
  label,
  className,
}: {
  card: Card;
  // What happens when the card itself is pressed, which is how the build screen
  // moves one between the deck and the sideboard. A placard is already the whole
  // target -- name, cost, colour -- so a separate move button beside it was a
  // second, smaller thing to hit for the same act.
  //
  // The wrapper becomes a real button when this is given rather than staying a
  // div with a handler: it is already the focus stop and already carries the
  // hover preview, and two tab stops on one card is one too many.
  onClick?: () => void;
  // Said out loud in place of the name, because the name alone does not say what
  // pressing it does. Required in spirit whenever `onClick` is.
  label?: string;
  // The same frame with nothing printed in it: a card someone else's deck list
  // plays and yours does not. It keeps the colour, because which colours the
  // suggestion is reaching for is exactly what an absence has to say, and empties
  // the plate -- so a pile reads as cards you hold and slots you did not fill.
  //
  // The empty plate is painted base-100, the app's recessed surface, so it reads
  // as a hole punched through the frame. That means a ghost belongs on base-100:
  // today the deck board's piles, which are wells in exactly that colour.
  //
  // The dash around that plate is `base-content/40` and not the near-black the
  // filled plate is edged with, which is what it inherited. A dark dash on a
  // dark hole is a dash nobody can see, so the mark the board's legend promises
  // -- and the only thing distinguishing a ghost at a glance from a card in a
  // dark frame -- was not being drawn. Same token as the legend's swatch, so the
  // two are the same line in both themes.
  ghost?: boolean;
  className?: string;
}) {
  const frame = frameFor(card);
  // Always with stats: a placard is a review, results or verdict row, and by then
  // the draft is over and the numbers are the thing being taught.
  const hover = useCardHover(card, true);

  // Nothing in this app sets a cursor on a bare button and daisyUI's `.btn` is
  // not in play here, so a pressable placard has to ask for the hand itself.
  const Wrapper = onClick ? "button" : "div";
  const press = onClick
    ? ({ type: "button", onClick, "aria-label": label } as const)
    : ({ tabIndex: 0 } as const);

  return (
    <Wrapper
      className={`rounded-[11px] text-left outline-offset-2 focus-visible:outline focus-visible:outline-primary motion-safe:transition-transform motion-safe:hover:-translate-y-px ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${NATURAL_W} ${className ?? ""}`}
      {...press}
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
          className={`flex items-center justify-between gap-2 rounded-md px-1.5 ${
            ghost
              ? "border border-dashed border-base-content/40 bg-base-100"
              : "border border-black/55"
          }`}
          style={
            ghost
              ? undefined
              : {
                  background: `linear-gradient(to bottom, color-mix(in srgb, ${frame.plate} 88%, #fff), ${frame.plate})`,
                  // The bright hairline the plate is drawn with, just inside its dark edge.
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5)",
                }
          }
        >
          {/* The app's display face, which is here for the same reason it is on
              headings: it is the closest licensable stand-in for Beleren, the
              face Magic prints card names in. */}
          <span
            className={`truncate font-display text-[15px] font-bold leading-4.5 tracking-tight ${
              ghost ? "text-base-content/60" : "text-[#0d0b06]"
            }`}
            title={card.name}
          >
            {card.name}
          </span>
          <ManaCost
            cost={card.manaCost}
            shadow={!ghost}
            className={`shrink-0 whitespace-nowrap text-[11px] ${ghost ? "opacity-60" : ""}`}
          />
        </div>
      </div>
    </Wrapper>
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
  columns = false,
  className,
}: {
  cards: Card[];
  trailing?: (card: Card, index: number) => ReactNode;
  // Wrap into as many natural-width columns as the container fits, instead of
  // one. A placard cannot be widened to fill a wide panel -- see NATURAL_W -- so
  // the only honest way for a list to use one is more columns. Read across then
  // down, which is what a grid does anyway and costs nothing here: the list is
  // already sorted, so what you scan for is a name, not the next row.
  columns?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={`${
        columns
          ? "grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-x-5 gap-y-0.5"
          : "flex flex-col gap-0.5"
      } ${className ?? ""}`}
    >
      {/* Keyed by position, not name: drafting two copies of the same card is
          normal, so names are not unique in a pool. */}
      {cards.map((card, i) => (
        <PlacardRow key={`${card.name}-${i}`} card={card} trailing={trailing?.(card, i)} />
      ))}
    </ul>
  );
}
