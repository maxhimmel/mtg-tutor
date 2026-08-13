import { type Card, type CardText, type EngineCard, normalizeName } from "./card.js";
import type { RecordedPick } from "./pick.js";
import type { PickScore } from "../scoring/score.js";

// Putting the two halves of a card back together.
//
// The engine deals in EngineCard, because that is what its document carries --
// see card.ts for why. Anything that renders a card or writes one into a prompt
// needs the other half, and this is the join.
//
// One implementation, used by the server, the web app and the CLI alike, so the
// three cannot disagree about what a whole card is. Keyed on normalizeName, the
// same key the text rows are stored under, so a DFC's halves cannot miss each
// other over a `//`.

export type TextIndex = ReadonlyMap<string, CardText>;

export function textIndex(text: readonly CardText[]): TextIndex {
  return new Map(text.map((t) => [normalizeName(t.name), t]));
}

export function hydrateCard(card: EngineCard, text: TextIndex): Card {
  const half = text.get(normalizeName(card.name));
  if (!half) {
    // A card that was dealt but has no text means the two halves of the set
    // were written by different ingests. Loud, because the alternative is a
    // card rendering as a blank frame with no name and a prompt describing it
    // as "undefined mana, undefined".
    throw new Error(
      `No card text for "${card.name}". Re-run the sets:ingest action for this set.`,
    );
  }
  return { ...half, ...card };
}

export function hydrate(cards: readonly EngineCard[], text: TextIndex): Card[] {
  return cards.map((c) => hydrateCard(c, text));
}

export function hydrateScore(score: PickScore, text: TextIndex): PickScore<Card> {
  // `preferred` is stripped before the spread and put back after, because
  // spreading an optional EngineCard field leaves it typed as one -- and a Card
  // score holding an un-hydrated card is exactly the mistake this function is
  // here to prevent.
  const { preferred, ...rest } = score;
  return {
    ...rest,
    picked: hydrateCard(score.picked, text),
    rawBest: hydrateCard(score.rawBest, text),
    contextBest: hydrateCard(score.contextBest, text),
    band: hydrate(score.band, text),
    ...(preferred ? { preferred: hydrateCard(preferred, text) } : {}),
  };
}

/** A recorded pick with every card in it whole -- what a prompt builder wants. */
export function hydratePick(rec: RecordedPick, text: TextIndex): RecordedPick<Card> {
  return {
    ...rec,
    pack: hydrate(rec.pack, text),
    picked: hydrateCard(rec.picked, text),
    score: hydrateScore(rec.score, text),
  };
}
