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

// Damage that answers a THREAT. The first version tested `deals \d+ damage to`
// and nothing more, which counted "deals 1 damage to each opponent" as removal
// -- an aggro creature filed under the role a deck stocks to survive. Measured
// at 56 of 282 such cards across 17 sets, so a fifth of everything the app
// called burn was reach.
//
// "any target" stays in on purpose: that is a bolt, and a card that CAN point at
// a creature is one you keep for a creature.
// `any target` is spelled out rather than left to a bare `target` alternative,
// which is what the first attempt did -- and "deals 2 damage to target player"
// then matched on the word `target` and came back as removal. The thing being
// pointed at has to be named.
const DAMAGES_A_THREAT =
  /deals \d+ damage to (any target|(target |each )?(creature|permanent|planeswalker))/;

// Fight, bite and "deals damage equal to its power", which the old pattern
// missed entirely because the amount is an expression rather than a number --
// 44 spells sitting in `other` while doing the most removal-shaped thing there
// is.
// Two wordings for one card. Recent sets print the keyword -- "fights up to one
// target creature" -- while older ones spell the whole thing out, and
// "deals damage equal to its power to each of two other target creatures" is
// neither a number nor a simple target.
const FIGHTS =
  /\bfights?\b|deals damage equal to [^.]*? to [^.]*?(creature|permanent|planeswalker)/;

const EVASION = /\b(flying|menace|trample|can't be blocked)\b/;

// Words that make a line about giving evasion to something rather than having
// it. `flying` matched anywhere counted 98 of 923 evasion cards (10.6%) that
// hand it out -- a pump spell is not a flier, and DECK-06 counts bodies.
const GRANTS = /\b(gains?|gain|have|has|target|another|enchanted|equipped|whenever|when|choose)\b/;

/**
 * Whether the card ITSELF has evasion, read line by line.
 *
 * Keyword abilities are printed on their own line -- "Flying" or "Flying,
 * vigilance" -- while granting one always comes with a subject and a verb. So a
 * line carrying an evasion keyword and none of the granting words is the card
 * having it, and that distinction is not available to a pattern matched against
 * the whole text at once.
 */
function hasEvasion(oracleText: string): boolean {
  return oracleText
    .split("\n")
    .some((line) => EVASION.test(line) && !GRANTS.test(line));
}

export function detectRole(card: { oracleText: string; typeLine: string }): CardRole {
  // Before anything else: a land does nothing a spell role describes, and the
  // deck counts it in a different total entirely. It was previously filtered out
  // by callers checking `isLand` themselves, which is a check the pick path
  // cannot make -- `isLand` reads the type line.
  if (isLand(card)) return "land";

  const t = card.oracleText.toLowerCase();
  if (
    /destroy target|exile target (creature|permanent)|target creature gets -/.test(t) ||
    DAMAGES_A_THREAT.test(t) ||
    FIGHTS.test(t)
  )
    return "removal";
  if (/(draw (a|two|three|\d+) cards?)/.test(t)) return "card advantage";
  if (hasEvasion(t)) return "evasion";
  if (/\bcreature\b/.test(card.typeLine.toLowerCase())) return "creature";
  return "other";
}
