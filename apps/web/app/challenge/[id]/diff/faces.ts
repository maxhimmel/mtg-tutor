import type { Card } from "@mtg-tutor/core";

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
