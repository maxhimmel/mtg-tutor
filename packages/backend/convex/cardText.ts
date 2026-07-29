import { ConvexError } from "convex/values";
import type { Card, CardText, EngineCard, RecordedPick } from "@mtg-tutor/core";
import { normalizeName } from "@mtg-tutor/core";

// Putting the rules text back on cards the engine dealt.
//
// The engine works in EngineCard -- names, colours, rarity and the numbers a
// value comparison needs -- because that is all its document carries. Anything
// that shows a card to a person, or writes one into a prompt, needs the other
// half: the type line, the mana value, the oracle text, the statistics that
// make a win rate legible. This is where the two are put back together.
//
// Keyed by normalizeName rather than the raw name, because that is what every
// other name match in this codebase uses and a DFC's two halves must not miss
// each other over a `//`.

export type TextIndex = Map<string, CardText>;

export function textIndex(cards: readonly CardText[]): TextIndex {
  return new Map(cards.map((c) => [normalizeName(c.name), c]));
}

function textFor(card: EngineCard, index: TextIndex): CardText {
  const text = index.get(normalizeName(card.name));
  if (!text) {
    // A card the engine dealt that the text side has never heard of means the
    // two halves of the set were written by different ingests. Loud, because
    // the alternative is a card rendering as a blank frame with no name on it.
    throw new ConvexError(
      `No card text stored for "${card.name}". Re-run the sets:ingest action for this set.`,
    );
  }
  return text;
}

export function hydrateCard(card: EngineCard, index: TextIndex): Card {
  return { ...textFor(card, index), ...card };
}

export function hydrate(cards: readonly EngineCard[], index: TextIndex): Card[] {
  return cards.map((c) => hydrateCard(c, index));
}

/** A recorded pick with every card in it whole -- what a prompt builder wants. */
export function hydratePick(rec: RecordedPick, index: TextIndex): RecordedPick<Card> {
  return {
    ...rec,
    pack: hydrate(rec.pack, index),
    picked: hydrateCard(rec.picked, index),
    score: {
      ...rec.score,
      picked: hydrateCard(rec.score.picked, index),
      best: hydrateCard(rec.score.best, index),
    },
  };
}
