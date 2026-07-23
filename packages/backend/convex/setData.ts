import type { SetData } from "@mtg-tutor/core";
import { buildSetData } from "@mtg-tutor/core";
import type { Doc } from "./_generated/dataModel.js";

// Rehydrates a stored set document into the SetData the draft engine expects.
// Pools and the name index are derived, so only the flat card list is stored.
export function toSetData(doc: Doc<"sets">): SetData {
  return buildSetData(
    doc.code,
    doc.cards,
    new Map(doc.colorPairWinRates.map(({ pair, winRate }) => [pair, winRate])),
    doc.packComposition,
  );
}
