"use client";

import type { Card } from "@mtg-tutor/core";
import { webpImage } from "../lib/cardImage";
import { useSettings } from "../lib/useSettings";
import { useCardHover, useHidePreview } from "./CardPreview";

// daisyUI's hover-3d reads the tilt direction from which of eight sibling hover
// zones the cursor is in -- a 3x3 grid minus the centre. They are part of the
// component's DOM contract, not spacing.
const TILT_ZONES = [0, 1, 2, 3, 4, 5, 6, 7];

// What a card looks like, with nothing you can do to it. Separate from the tile
// because the pack being passed on is a picture of a pack, not a set of controls
// -- rendering it as buttons would put fifteen tab stops on cards that are on
// their way off the screen.
export function CardFace({ card, className }: { card: Card; className?: string }) {
  return (
    // The edge treatment is the caller's, not part of a card face: a selected
    // card's ring sets its own border-width, and a base `border-transparent`
    // here would be one more rule for it to have to beat.
    <span className={`card-aspect relative block w-full overflow-hidden rounded-xl ${className ?? ""}`}>
      {card.imageUrl ? (
        // Plain <img>: Scryfall already serves an appropriately sized image,
        // so next/image's optimizer would add cost without benefit. Eager
        // because the surfaces that show tiles show a whole pack at once and
        // wait for it (lib/preloadImages) -- deferring anything here would only
        // reintroduce the pop-in that preloading removes.
        <img
          src={webpImage(card.imageUrl)}
          alt={card.name}
          loading="eager"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full flex-col justify-between border border-base-300 bg-base-200 p-3 text-left">
          <span className="text-sm font-semibold">{card.name}</span>
          <span className="text-xs text-base-content/60">{card.typeLine}</span>
        </span>
      )}
    </span>
  );
}

export function CardTile({
  card,
  onPick,
  disabled,
  showStats,
  label,
  selected,
}: {
  card: Card;
  onPick: (card: Card) => void;
  disabled?: boolean;
  // Drawn half-pulled from the row, the way you hold a card you are thinking
  // about before you take it. What a click then means is the caller's business:
  // the tile only reports that it was clicked.
  selected?: boolean;
  // Overrides the guiderails setting when given. The review quiz passes false:
  // the hover panel leads with the card's win rate, which is the answer to the
  // question the quiz is asking.
  showStats?: boolean;
  // The accessible name defaults to "Pick <card>", which is a lie anywhere the
  // click is a guess rather than a pick.
  label?: string;
}) {
  const { settings } = useSettings();
  // Guiderails now show up only on hover. The tile used to also carry a win-rate
  // badge in its corner, which the stats panel makes redundant -- and the badge
  // was the worse of the two, being a bare number sitting on the card art with
  // nothing to say what it measured.
  const hover = useCardHover(card, showStats ?? settings.guiderails);
  const hidePreview = useHidePreview();

  return (
    <button
      type="button"
      className={`hover-3d group w-full cursor-pointer bg-transparent p-0 transition-transform perspective-midrange disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "-translate-y-3" : ""}`}
      onClick={() => {
        hidePreview();
        onPick(card);
      }}
      disabled={disabled}
      aria-label={label ?? `Pick ${card.name}`}
      {...hover}
    >
      {/* First child is the face that tilts; hover-3d clips it and applies the
          shine. `relative` is that shine's positioning context -- the effect's
          ::before is absolute -- not leftover from the win-rate badge. */}
      <CardFace
        card={card}
        className={selected ? "card-lit" : "border border-transparent group-hover:border-primary"}
      />

      {TILT_ZONES.map((i) => (
        <span key={i} aria-hidden className="block" />
      ))}
    </button>
  );
}
