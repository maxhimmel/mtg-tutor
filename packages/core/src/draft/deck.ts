import { DECK } from "../config.js";
import type { Card, ColorWinRate } from "../model/card.js";
import { isBasicLand, isLand } from "../model/card.js";
import { manaCurve } from "../model/mana.js";
import { splashCost } from "../scoring/context.js";
import { cardValue } from "../scoring/value.js";

export interface DeckSuggestion {
  colors: string[];
  spells: Card[]; // nonland playables
  nonbasicLands: Card[]; // drafted lands that take land slots, not spell slots
  basicLands: number; // basics to add on top
  // Spells per `manaCurve` bucket, counted rather than carried. Reported, never
  // selected on -- see `curveOf`.
  curve: number[];
}

export interface DeckOptions {
  /**
   * The set's archetype table, which is what prices a third colour.
   *
   * Without it the candidates stay two-colour. That is not a default so much as
   * a refusal: widening can only ever ADD value, because the 23 best cards in
   * three colours are by construction at least as good as the 23 best in two,
   * so a builder that cannot price width will always take the widest deck
   * available. A set we have no archetype data for gets the narrow answer
   * rather than a confident wrong one.
   */
  archetypes?: readonly ColorWinRate[];
  spellCount?: number;
  deckSize?: number;
}

const COLOR_SETS = (() => {
  const cols = ["W", "U", "B", "R", "G"];
  const pairs: string[][] = [];
  const triples: string[][] = [];
  for (let i = 0; i < cols.length; i++)
    for (let j = i + 1; j < cols.length; j++) {
      pairs.push([cols[i], cols[j]]);
      for (let k = j + 1; k < cols.length; k++) triples.push([cols[i], cols[j], cols[k]]);
    }
  return { pairs, triples };
})();

const fitsColors = (c: Card, colors: string[]) =>
  c.colors.length === 0 || c.colors.every((col) => colors.includes(col));

// Lands print colorless, so their `colors` says nothing -- a Boros tapland is
// only playable in a Boros deck by its color identity.
const landFitsColors = (c: Card, colors: string[]) =>
  c.colorIdentity.every((col) => colors.includes(col));

// Whether the table prices this exact width, rather than falling back to a mean.
//
// `splashCost` answers for any width, because the pick path needs an answer for
// the deck it is actually in. A BUILDER choosing to go wider is a different
// question: an unmeasured width falls back to the format's own rate, which the
// two-colour decks it is being compared against dominate, so the gap collapses
// and the extra colour reads as nearly free. Both sides of the comparison have
// to have been played by somebody for the difference between them to be a
// measurement.
//
// The width itself, not "something at least this wide". A format with three-
// and five-colour rows and nothing at four says nothing about four.
const measures = (archetypes: readonly ColorWinRate[], width: number) =>
  archetypes.some((a) => a.colors.length === width);

// When the deck can act, as counts. Through `manaCurve` rather than by mana
// value, so the number the build screen diffs is bucketed the same way as the
// chart drawn next to it -- two curve conventions in one codebase is one more
// than the subject supports.
//
// Reported rather than optimised against. A curve is the one part of deck
// building where the convention ("two two-drops, then...") is loudest and the
// evidence is thinnest: the winning-deck curves are in the 17Lands game data,
// but the artifact this app is built on drops basic lands and collapses each
// card's copies to a yes/no, so neither the land count nor the field's real
// curve survives into anything the engine can read. Selecting on a curve we
// cannot measure would be inventing the number this was meant to replace.
const curveOf = (spells: Card[]): number[] => manaCurve(spells).map((b) => b.cards.length);

// Pick the color set whose on-color playables are worth the most, then take the
// best spells in those colors and fill the land slots.
//
// Width is charged per card, not per deck. `cardValue` is in win-rate points
// and the total below is a sum of them, so a cost expressed once would be
// twenty-three times too small to matter. Every card in a three-color deck is
// being played in a deck that wins `splashCost` less often, so every card pays
// it -- which is the same charge `contextValue` already applies to a pick that
// would widen the pool, in the same units.
//
// The price is measured per set and there is nothing here to tune: three colors
// costs 4.3pp in fdn and 0.3pp in snc, where most of the field is doing it.
export function suggestDeck(pool: Card[], options: DeckOptions = {}): DeckSuggestion {
  const { archetypes, spellCount = DECK.spellCount, deckSize = DECK.size } = options;

  // Lands are not spells. Counting Evolving Wilds or a drafted basic toward the
  // 23 and then adding a full 17 basics on top builds a 40-card deck with 18+
  // lands in it, which is not the deck the readout claims.
  const spellPool = pool.filter((c) => !isLand(c));
  const landPool = pool.filter((c) => isLand(c) && !isBasicLand(c));
  const landSlots = deckSize - spellCount;

  const fill = (colors: string[], spells: Card[]): DeckSuggestion => {
    const nonbasicLands = landPool
      .filter((c) => landFitsColors(c, colors))
      .sort((a, b) => cardValue(b) - cardValue(a))
      .slice(0, Math.min(DECK.maxNonbasicLands, landSlots));

    return {
      colors,
      spells,
      nonbasicLands,
      basicLands: deckSize - spells.length - nonbasicLands.length,
      curve: curveOf(spells),
    };
  };

  const priced = archetypes != null && measures(archetypes, 2) && measures(archetypes, 3);
  const candidates = priced ? [...COLOR_SETS.pairs, ...COLOR_SETS.triples] : COLOR_SETS.pairs;

  let best: DeckSuggestion | undefined;
  let bestTotal = -Infinity;

  for (const colors of candidates) {
    const playable = spellPool
      .filter((c) => fitsColors(c, colors))
      .sort((a, b) => cardValue(b) - cardValue(a))
      .slice(0, spellCount);
    if (playable.length < spellCount / 2) continue;
    const width = priced ? splashCost(archetypes!, colors.length) : 0;
    const total = playable.reduce((s, c) => s + cardValue(c) - width, 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = fill(colors, playable);
    }
  }

  if (!best) {
    const spells = [...spellPool].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, spellCount);
    best = fill([], spells);
  }
  return best;
}
