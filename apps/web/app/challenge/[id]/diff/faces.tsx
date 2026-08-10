"use client";

import type { Card } from "@mtg-tutor/core";
import { CardFace } from "../../../components/CardTile";
import { useCardHover } from "../../../components/CardPreview";

/**
 * A card as this screen can draw it, which is not always as a card.
 *
 * The diff reads rows written weeks ago and joins them against the set's text
 * today. A re-ingest that dropped a card leaves a name with nothing behind it,
 * and `card: null` is that case said out loud rather than a thrown error or --
 * worse -- a frame with "undefined" printed in it.
 */
export interface Face {
  name: string;
  colors: string[];
  card: Card | null;
}

/**
 * One card, readable.
 *
 * Card art at 150px is a picture of a card, not a card you can read, and this
 * screen was made entirely of them -- three separate places each rendering a
 * `CardFace` with their own copy of the dropped-card fallback beside it. The
 * app already solves reading a card: `HoverPreviewProvider` is mounted for the
 * whole application in providers.tsx, and `useCardHover` opens the full frame
 * with its rules text, its back face, its keyword panel and its numbers.
 *
 * Nothing had to be fetched to turn it on here. `sets.cardText`, which this
 * screen already reads once for the art, carries oracle text, mana cost, layout,
 * back image, win rate, ALSA and IWD -- the whole of what the panel shows. The
 * handlers were simply never spread on.
 *
 * `showStats` is true, for the reason review and results pass true: the draft is
 * over, so the numbers are the lesson rather than the answer to a question
 * somebody is still being asked.
 *
 * Mouse and focus both, which is what `useCardHover` returns -- but the caller
 * decides whether the element it lands on is focusable. A pack of fourteen is
 * not: fourteen tab stops that lead nowhere is worse than no keyboard path, and
 * every card here is named in text beside it.
 */
export function FaceCard({
  face,
  className,
  compact,
}: {
  face: Face;
  className?: string;
  // The fallback's text size, for the few places a face is drawn small.
  compact?: boolean;
}) {
  const hover = useCardHover(face.card ?? undefined, true);

  if (!face.card) {
    // A card the set no longer has. Its name is still the truth about what was
    // taken, and saying so beats a blank frame.
    return (
      <span
        className={`card-aspect flex w-full items-center justify-center rounded-xl border border-dashed border-base-content/25 bg-base-200 text-center ${
          compact ? "p-2 text-xs" : "p-3 text-sm"
        }`}
      >
        {face.name}
      </span>
    );
  }

  return (
    <span className="block" {...hover}>
      <CardFace card={face.card} className={className} />
    </span>
  );
}

/**
 * A card as its name, with the whole card one hover away.
 *
 * The fork list is names rather than art, and the art is what a reader reaches
 * for the moment a name is not enough. `useCardHover` is already how every other
 * surface in this app answers that -- so the name carries the same handlers the
 * face does, and pointing at it opens the full frame with its rules text and its
 * numbers. A card the set has since dropped simply has nothing to open, which is
 * what an empty handler set already means.
 */
export function FaceName({ face, className }: { face: Face; className?: string }) {
  const hover = useCardHover(face.card ?? undefined, true);

  return (
    <span className={`truncate ${className ?? ""}`} {...hover}>
      {face.name}
    </span>
  );
}
