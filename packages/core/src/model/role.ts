import { isLand } from "./card.js";

// What a card DOES, in the four categories a Limited deck is counted in.
//
// AN INGEST-TIME CLASSIFIER, WHICH IS WHY IT LIVES HERE
//
// This began in `scoring/explain.ts`, next to the one sentence of prose that
// used it, and it reads `oracleText` and `typeLine` -- both on the text half of
// a card. That made every reader of it a reader of the text half, and so
// browser-only: the pick path holds `EngineCard`, which carries neither.
//
// The consequence was not a missing feature but a divided one. The principle
// tiebreak needs roles, so it could only run in the browser, while the grade ran
// on the server -- and the two then disagreed about the same pack three separate
// times before anyone traced it here. Settling the answer at ingest and storing
// it on the card is what lets both sides read the same thing. Same move
// `EngineCard.value` already makes for `computeCardValue`, for the same reason.
//
// WHAT THAT COSTS, HONESTLY
//
// A regex over rules text is a rough instrument, and freezing its output means
// correcting it needs a re-ingest rather than a deploy. That is the trade
// `value` already accepts, and it buys the thing the split could not have at any
// price: one answer, on both sides, for every client.

export type CardRole = "removal" | "evasion" | "card advantage" | "creature" | "land" | "other";

export function detectRole(card: { oracleText: string; typeLine: string }): CardRole {
  // Before anything else: a land does nothing a spell role describes, and the
  // deck counts it in a different total entirely. It was previously filtered out
  // by callers checking `isLand` themselves, which is a check the pick path
  // cannot make -- `isLand` reads the type line.
  if (isLand(card)) return "land";

  const t = card.oracleText.toLowerCase();
  if (
    /(destroy target|deals \d+ damage to|exile target (creature|permanent)|target creature gets -)/.test(
      t,
    )
  )
    return "removal";
  if (/(draw (a|two|three|\d+) cards?)/.test(t)) return "card advantage";
  if (/(flying|menace|can't be blocked|trample)/.test(t)) return "evasion";
  if (/\bcreature\b/.test(card.typeLine.toLowerCase())) return "creature";
  return "other";
}
