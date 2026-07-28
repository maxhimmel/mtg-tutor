import type { SetData } from "@mtg-tutor/core";
import { buildSetData } from "@mtg-tutor/core";
import type { Doc } from "./_generated/dataModel.js";

// Rehydrates a stored set into the SetData the draft engine expects. Pools and
// the name index are derived, so only the flat card list is stored.
//
// Takes the `setCards` document rather than the `sets` one: everything a replay
// needs lives there, so a pick reads a single row. See schema.ts.
export function toSetData(doc: Doc<"setCards">): SetData {
  return buildSetData(
    doc.code,
    doc.cards,
    new Map(doc.colorPairWinRates.map(({ pair, winRate }) => [pair, winRate])),
    doc.packComposition,
  );
}
