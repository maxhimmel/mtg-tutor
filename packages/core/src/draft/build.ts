import { DECK } from "../config.js";
import type { Card, ColorCode } from "../model/card.js";
import { isBasicLand, isLand } from "../model/card.js";
import type { Bench } from "../model/bench.js";
import { castingValue } from "../model/mana.js";
import { colorKey } from "../scoring/context.js";
import { curveCounts, type DeckSuggestion } from "./deck.js";

// A card and where it sits in the pool. The position is what benching is keyed
// on -- drafting two copies of a common is normal and setting one aside must not
// set aside both -- so it has to survive the sort into curve order.
export interface DeckPick<C> {
  card: C;
  pos: number;
}

// The order a deck list is read in, and the only one this app has. Lifted out of
// `deckPiles` because the results screen lays the suggestion beside the pool the
// builder sorted, and a comparison whose two sides are sorted differently is not
// one. Exported for the same reason one step further out: the terminal prints
// the same deck list, and two clients sorting one deck two ways is the same bug
// with a wider blast radius.
//
// By `castingValue` rather than `cmc`, so a split card sits on the half you
// would actually cast -- the same rule the curve beside it is bucketed by.
export const byCurve = <C extends { name: string; cmc: number; manaCost?: string }>(a: C, b: C) =>
  castingValue(a) - castingValue(b) || a.name.localeCompare(b.name);

/**
 * The pool as the two piles a build screen shows, in the order a deck list is
 * read: what it can do on turn one, first.
 *
 * A pool with two conventions for when a card comes down is one more than the
 * subject supports, so the sort is `byCurve` above and nothing else.
 */
export function deckPiles<C extends { name: string; cmc: number; manaCost?: string }>(
  pool: readonly C[],
  bench: readonly Bench[],
): { maindeck: DeckPick<C>[]; sideboard: DeckPick<C>[] } {
  // The clock is not read, which is what separates this from `splitPool`. That
  // one rebuilds the deck as it stood at a given pick, because a decision made
  // at pick 40 is not evidence about the deck being built at pick 5. This one
  // answers what the player is playing NOW, and every bench they have made
  // counts toward it however late it was made.
  const benched = new Set(bench.map((b) => b.pos));
  const inOrder = (a: DeckPick<C>, b: DeckPick<C>) => byCurve(a.card, b.card);

  const picks = pool.map((card, pos) => ({ card, pos }));
  return {
    maindeck: picks.filter((p) => !benched.has(p.pos)).sort(inOrder),
    sideboard: picks.filter((p) => benched.has(p.pos)).sort(inOrder),
  };
}

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

// A Limited deck is exactly forty cards. Not at least forty, which is why this
// is a comparison and not a floor, and why the build screens count down to it
// rather than up.
export const isLegalDeck = (deck: BuiltDeck): boolean => deck.size === DECK.size;

// How far off forty, said the way a build screen says it. Null when there is
// nothing to say, which is the one state that locks in.
export function deckSizeNote(deck: BuiltDeck): string | null {
  const over = deck.size - DECK.size;
  if (over === 0) return null;
  return over > 0 ? `${over} too many` : `${-over} short`;
}

// Basics are not picks, so nothing in the pool bounds them and this is the whole
// of what makes a land count a number rather than a typo. Shared because the
// mutation that stores it and every screen that offers it have to agree on what
// will be accepted -- a stepper that goes somewhere the mutation refuses is a
// button that throws.
export const isLandCount = (n: number): boolean =>
  Number.isInteger(n) && n >= 0 && n <= DECK.size;

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

/**
 * What comparing two decks needs, which is less than either kind of deck has.
 *
 * `compareDecks` and `alignDecks` took a `DeckSuggestion` and were handed a
 * second BuiltDeck by the challenge screen, which compares two players' forties
 * -- structurally fine until the suggestion grew a mana base neither comparison
 * reads. Naming the overlap is what stops the next field added to a suggestion
 * from breaking a comparison that never wanted it.
 */
export type ComparableDeck = Pick<
  DeckSuggestion,
  "colors" | "spells" | "nonbasicLands" | "basicLands" | "curve"
>;

export function compareDecks(built: BuiltDeck, suggested: ComparableDeck): DeckDiff {
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

// The same forty, card for card -- which is what both of the diff's lists being
// empty says, and the headline every results screen leads with.
export const decksAgree = (diff: DeckDiff): boolean =>
  diff.onlyBuilt.length === 0 && diff.onlySuggested.length === 0;

/** One line of the comparison. At least one side is always present. */
export interface DeckRow {
  built?: Card;
  suggested?: Card;
}

/**
 * The two decks as one list, a card to a row.
 *
 * `compareDecks` answers what the disagreement IS; this answers where it falls,
 * which is the question you can only ask with both decks in front of you. A card
 * both play takes one row and holds both sides of it, so the comparison is as
 * long as the union of the two forties -- forty-six rows for a six-card
 * disagreement -- rather than the eighty that stacking two whole decks costs.
 *
 * The merge is a two-pointer walk and not a lookup, which is what keeps the rows
 * in curve order on both sides at once. It works because both lists are sorted
 * by the same key: a name in both decks reaches the same place in each, so the
 * two copies meet. Two copies of a common pair up one at a time and the third
 * copy, if only one side plays it, is left on its own row -- the same count
 * `compareDecks` reaches by multiset.
 */
export function alignDecks(built: BuiltDeck, suggested: ComparableDeck): DeckRow[] {
  const mine = [...built.spells, ...built.nonbasicLands].sort(byCurve);
  const theirs = [...suggested.spells, ...suggested.nonbasicLands].sort(byCurve);

  const rows: DeckRow[] = [];
  let i = 0;
  let j = 0;
  while (i < mine.length || j < theirs.length) {
    const a = mine[i];
    const b = theirs[j];
    if (a && b && a.name === b.name) rows.push({ built: mine[i++], suggested: theirs[j++] });
    else if (b === undefined || (a !== undefined && byCurve(a, b) <= 0))
      rows.push({ built: mine[i++] });
    else rows.push({ suggested: theirs[j++] });
  }
  return rows;
}
