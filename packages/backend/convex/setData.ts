import type { Card, SetData } from "@mtg-tutor/core";
import { buildSetData } from "@mtg-tutor/core";
import type { Doc } from "./_generated/dataModel.js";

// Rehydrates a stored set into the SetData the draft engine expects. Pools and
// the name index are derived, so only the flat card list is stored.
//
// The cards are passed in rather than read off `doc` because they live in their
// own table -- see the `setCards` comment in schema.ts.
export function toSetData(doc: Doc<"sets">, cards: Card[]): SetData {
  return buildSetData(
    doc.code,
    cards,
    new Map(doc.colorPairWinRates.map(({ pair, winRate }) => [pair, winRate])),
    doc.packComposition,
  );
}
