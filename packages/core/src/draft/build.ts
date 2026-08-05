import type { Card, ColorCode } from "../model/card.js";
import { isBasicLand, isLand } from "../model/card.js";
import { colorKey } from "../scoring/context.js";
import { curveCounts, type DeckSuggestion } from "./deck.js";

// The deck the player built, read out of the pile they drafted.
//
// There is no stored deck list and deliberately so. Which cards are in is the
// maindeck half of `splitPool` -- the same split the draft screen has been
// writing all along -- so the build is always whatever the player last said,
// and cannot fall out of step with a second copy of itself. The one thing that
// split cannot express is how many lands to add, which is the other half of
// building a 40 and the only number the session stores for it.
export interface BuiltDeck {
  colors: string[];
  spells: Card[];
  nonbasicLands: Card[];
  basicLands: number;
  curve: number[];
  /** Spells, drafted lands and basics. The player's answer to "is this a 40?" */
  size: number;
}

export function buildDeck(maindeck: readonly Card[], basicLands: number): BuiltDeck {
  // A drafted basic never counts, for the same reason `cardValue` scores one at
  // zero: you are handed as many as you want, so one sitting in the pool is not
  // a slot the player spent.
  const kept = maindeck.filter((c) => !isBasicLand(c));
  const spells = kept.filter((c) => !isLand(c));
  const nonbasicLands = kept.filter((c) => isLand(c));

  const colors = new Set<ColorCode>();
  for (const c of spells) for (const col of c.colors) colors.add(col);

  return {
    // What a deck list says it is: every colour it asks for. Not `commitment`'s
    // value-weighted read, which answers a different question -- how committed
    // the deck is -- and would let a splash disappear from the deck's own name.
    colors: [...colorKey(colors)],
    spells,
    nonbasicLands,
    basicLands,
    curve: curveCounts(spells),
    size: kept.length + basicLands,
  };
}

/**
 * Where the player's 40 and the suggestion part company.
 *
 * Neither side is labelled the better one. The suggestion is what `cardValue`
 * and the format's own width price come to, which is an argument rather than an
 * answer: it cannot see that your two removal spells both want the same target,
 * and the player can. What it is good for is showing you the cards you and it
 * disagree about, which is a shorter and more useful list than either deck.
 */
export interface DeckDiff {
  /** In the suggestion, not in your 40. */
  onlySuggested: Card[];
  /** In your 40, not in the suggestion. */
  onlyBuilt: Card[];
  /** Cards both decks play. */
  shared: number;
  /** Total lands, drafted and basic, on each side. */
  lands: { built: number; suggested: number };
  curve: { built: number[]; suggested: number[] };
  colors: { built: string[]; suggested: string[] };
}

// By name and by count, not by identity. Both decks are drawn from the same
// hydrated pool today, so comparing references would work and would break
// silently the first time a caller rebuilt one of the arrays. Counting names
// keeps two copies of the same common honest either way: play both and it
// plays both, play one and exactly one copy shows up on the list.
function multiset(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return counts;
}

function surplus(cards: readonly Card[], against: Map<string, number>): Card[] {
  const remaining = new Map(against);
  const out: Card[] = [];
  for (const c of cards) {
    const n = remaining.get(c.name) ?? 0;
    if (n > 0) remaining.set(c.name, n - 1);
    else out.push(c);
  }
  return out;
}

export function compareDecks(built: BuiltDeck, suggested: DeckSuggestion): DeckDiff {
  const builtCards = [...built.spells, ...built.nonbasicLands];
  const suggestedCards = [...suggested.spells, ...suggested.nonbasicLands];

  const onlyBuilt = surplus(builtCards, multiset(suggestedCards));
  const onlySuggested = surplus(suggestedCards, multiset(builtCards));

  return {
    onlySuggested,
    onlyBuilt,
    shared: builtCards.length - onlyBuilt.length,
    lands: {
      built: built.nonbasicLands.length + built.basicLands,
      suggested: suggested.nonbasicLands.length + suggested.basicLands,
    },
    curve: { built: built.curve, suggested: suggested.curve },
    colors: { built: built.colors, suggested: suggested.colors },
  };
}
