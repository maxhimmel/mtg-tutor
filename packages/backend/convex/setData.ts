import type { SetData } from "@mtg-tutor/core";
import { buildSetData, withPackSlots } from "@mtg-tutor/core";
import type { Doc } from "./_generated/dataModel.js";

// Rehydrates a stored set into the SetData the draft engine expects. Pools and
// the name index are derived, so only the flat card list is stored.
//
// Takes the `setCards` document rather than the `sets` one: everything a replay
// needs lives there, so a pick reads a single row. See schema.ts.
export function toSetData(doc: Doc<"setCards">): SetData {
  return buildSetData(
    doc.code,
    // Stamped here rather than read off the stored card, because no stored card
    // carries a slot yet. This is the bridge across that: the documents still
    // hold the type line and set code the assignment is made from, so it costs
    // nothing but a pass over the list, and it produces exactly the partition
    // buildSetData used to derive on its own.
    //
    // It comes out when ingest writes the slot and the pool document is
    // narrowed to the engine's fields -- at which point there is no type line
    // left here to derive from, and none needed.
    withPackSlots(doc.code, doc.cards),
    new Map(doc.colorPairWinRates.map(({ pair, winRate }) => [pair, winRate])),
    doc.packComposition,
  );
}
