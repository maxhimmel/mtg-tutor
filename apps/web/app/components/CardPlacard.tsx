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

// The one ink everything printed on the filled plate is drawn in.
//
// It was on the name only, and the mana cost inherited `base-content` instead --
// which is near-white under this theme, on a plate mixed toward white. The pips
// survived that because `.ms-cost` paints its own disc and sets its own colour;
// the `//` a two-in-one card's cost is divided by does not, so it was white on
// cream and effectively unprinted. Anything added to this plate later that draws
// itself in `currentColor` would have arrived invisible the same way.
const PLATE_INK = "text-[#0d0b06]";

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
            className={`min-w-0 truncate font-display text-[15px] font-bold leading-4.5 tracking-tight ${
              ghost ? "text-base-content/60" : PLATE_INK
            }`}
            title={card.name}
          >
            {card.name}
          </span>
          {/* At most half the plate, which is what keeps the name on it.
              Progenitus costs ten pips -- about 150px at this size, wider on its
              own than the ~140px plate a curve well gives it. The name is
              `truncate`, so its automatic minimum size is zero and it gave up all
              of that width without complaint: the row printed a mana cost, no
              name at all, and the pips over the edge of the frame.

              The cap is on the cost rather than a floor under the name because a
              deck list is scanned by name -- when the two compete for the row,
              the identifier is the half that should win. ManaCost wraps within
              whatever it is given, so nothing is dropped; a ten-pip card is
              simply twice as tall a fact as a two-pip one. */}
          <ManaCost
            cost={card.manaCost}
            shadow={!ghost}
            className={`max-w-[50%] shrink-0 text-[11px] ${ghost ? "opacity-60" : PLATE_INK}`}
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
//
// One column, and no option for more. There was a `columns` flag that wrapped a
// list into as many natural-width columns as its container fit, on the reasoning
// that a placard cannot be widened -- see NATURAL_W -- so the only honest way for
// a list to use a wide panel is more of them. What it actually did was read a
// curve-sorted list across then down, putting a one-drop beside a five-drop on
// every row, which is how the deck builder ended up looking unordered. A wide
// panel full of cards wants the curve wells in `CurvePiles`, which are columns
// that MEAN something; this stays the narrow list it was drawn for.
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
