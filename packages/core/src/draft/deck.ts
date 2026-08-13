import { DECK } from "../config.js";
import type { Card, ColorWinRate } from "../model/card.js";
import { isBasicLand, isLand } from "../model/card.js";
import { castingValue, manaCurve, parseManaCost } from "../model/mana.js";
import { splashCost } from "../scoring/context.js";
import { cardValue } from "../scoring/value.js";

export interface DeckSuggestion {
  colors: string[];
  spells: Card[]; // nonland playables
  nonbasicLands: Card[]; // drafted lands that take land slots, not spell slots
  basicLands: number; // basics to add on top
  // Spells per `manaCurve` bucket, counted rather than carried. Reported, never
  // selected on -- see `curveCounts`.
  curve: number[];
  /**
   * Which basics to add, by colour. Empty when the deck has no coloured cards.
   *
   * The half of a mana base the suggestion has never had. "Add 17 basics" is not
   * a deck -- MANA-01 puts a typical 9/8 split behind the colour with more or
   * cheaper cards, and MANA-02 says never fewer than eight sources of a main
   * colour, and a readout that stops at the total is silent on both.
   */
  basicsByColor: Record<string, number>;
  /**
   * Colours the deck asks for and cannot reliably cast, by MANA-02 and MANA-05.
   *
   * A splash needs three sources (the Rule of Three) and a main colour needs
   * eight; below either, the card is in the deck list and not in the deck. This
   * is the one thing the builder can say that `cardValue` cannot see at all --
   * every term in the score is about how good a card is, and none of them is
   * about whether you can cast it.
   */
  uncastable: string[];
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

/**
 * How many lands this many expensive cards wants.
 *
 * DECK-04 states it as a rule with a number in it -- 16 lands if three or fewer
 * cards cost 5+, 17 if four or more -- and DECK-03 adds the top of the range:
 * 18 with a curve that cannot function missing its fourth land drop.
 *
 * THIS IS NOT THE MEASUREMENT `config.ts` SAYS IS MISSING, AND IS NOT PRETENDING
 * TO BE
 *
 * `DECK.spellCount` is 23 and its comment explains at length that the real
 * winning-deck land counts are not recoverable from anything stored, because
 * `build-set-stats.mjs` drops basics and collapses copies. All of that is still
 * true and none of it is what this replaces. 17 was a CONSTANT standing in for a
 * measurement; this is a cited rule that varies with the deck in front of it,
 * which is a different kind of thing and a better one to be wrong in -- a rule
 * can be checked against the corpus, and a constant can only be checked against
 * a dataset we do not have.
 *
 * Counted by `castingValue` rather than `cmc`, so a split card counts on the
 * half you would actually cast -- the same rule the curve beside it is bucketed
 * by, and the difference between a five-drop and a seven-drop for 29 cards in
 * the library.
 */
const HEAVY = 5;
export function landsFor(spells: readonly Card[]): number {
  const expensive = spells.filter((c) => castingValue(c) >= HEAVY).length;
  // DECK-03's top end. Beyond the range DECK-04 speaks to, and the corpus is
  // explicit that 19+ wants an exceptionally top-heavy curve -- which is not a
  // deck this builder can produce, since it is taking the best cards available
  // rather than a theme.
  if (expensive >= 7) return 18;
  return expensive >= 4 ? 17 : 16;
}

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
export const curveCounts = (spells: readonly Card[]): number[] =>
  manaCurve(spells).map((b) => b.cards.length);

/**
 * How much each colour is asked for, counted in PIPS rather than in cards.
 *
 * A card costing {B}{B} wants black twice as badly as one costing {1}{B}, and
 * counting cards says they want it the same. That is the whole content of
 * MANA-07 -- single-pip cards are easy to splash and double-pip cards are not --
 * so a split derived from card counts would call the two situations identical.
 *
 * Hybrid symbols count for every colour they offer, because either will cast it.
 */
export function colorPips(spells: readonly Card[]): Map<string, number> {
  const pips = new Map<string, number>();
  for (const card of spells) {
    for (const symbol of parseManaCost(card.manaCost)) {
      for (const half of symbol.split("/")) {
        if (WUBRG.includes(half)) pips.set(half, (pips.get(half) ?? 0) + 1);
      }
    }
  }
  return pips;
}

const WUBRG = ["W", "U", "B", "R", "G"];

/**
 * How many sources a colour needs before the deck can rely on it.
 *
 * MANA-02 puts a main colour at eight and MANA-05 puts a splash at three (the
 * Rule of Three). Which one applies is not a judgement call: MANA-04 defines a
 * splash as a card or two outside your main colours, so the pip count decides
 * it -- and MANA-07 is why the count is in pips, since one double-pip card is
 * not a splash however few cards carry the colour.
 */
const SPLASH_PIPS = 2;
const sourceFloor = (pips: number) => (pips <= SPLASH_PIPS ? 3 : 8);

/**
 * The basics, split by how hard each colour is being asked for -- but FLOORS
 * FIRST, which is the whole shape of the rule.
 *
 * A purely proportional split is what this did first and it is wrong in a way
 * that only shows up on ordinary decks. Thirteen white pips against eleven blue
 * is a completely normal two-colour deck; proportional gives it 9/7 out of 16
 * basics, and seven sources is below MANA-02's floor, so the builder would flag
 * a deck nobody would look at twice. MANA-02 does not say "prefer" eight, it
 * says never fewer -- so the floors are satisfied before anything is
 * distributed, and proportionality only allocates what is left above them.
 *
 * That turns the 13:11 deck into 8/8, which is what a person would build.
 *
 * Largest-remainder for the surplus rather than rounding each share on its own,
 * because independent rounding does not add back up to the number of lands you
 * have -- and a mana base a land short is not one.
 *
 * Nonbasic lands are read because they already produce colour: MANA-03 says a
 * dual counts once toward the land total and gives a source to both its colours,
 * so a deck holding one needs fewer basics of each. Ignoring them over-charges
 * every deck that drafted fixing, which is the deck most likely to be splashing
 * and so the one most in need of the count being right.
 */
function splitBasics(
  spells: readonly Card[],
  nonbasicLands: readonly Card[],
  colors: readonly string[],
  basics: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const wanted = colors.filter((c) => WUBRG.includes(c));
  if (wanted.length === 0 || basics <= 0) return out;

  const pips = colorPips(spells);
  const fromLands = (color: string) =>
    nonbasicLands.filter((l) => l.colorIdentity.includes(color as never)).length;

  // What each colour still needs in basics once its duals are counted. A colour
  // nothing asks for needs nothing, however it got into `colors`.
  const need = new Map(
    wanted.map((c) => {
      const asked = pips.get(c) ?? 0;
      return [c, asked === 0 ? 0 : Math.max(0, sourceFloor(asked) - fromLands(c))];
    }),
  );

  const floors = [...need.values()].reduce((a, b) => a + b, 0);
  for (const c of wanted) out[c] = 0;

  // The floors fit, so pay them and share out what remains by pip weight.
  // They do not fit on a deck asking for more colours than 16-17 lands can
  // serve, and then there is nothing to protect: fall through to proportional
  // and let `uncastableColors` say so out loud rather than quietly build a mana
  // base that meets no floor at all.
  let left = basics;
  if (floors <= basics) {
    for (const c of wanted) {
      out[c] = need.get(c) ?? 0;
      left -= out[c];
    }
  }

  const total = wanted.reduce((n, c) => n + (pips.get(c) ?? 0), 0);
  // A deck of colourless cards in named colours. Nothing asks for anything, so
  // spread them evenly rather than inventing a preference.
  const weight = (c: string) => (total === 0 ? 1 / wanted.length : (pips.get(c) ?? 0) / total);

  const exact = wanted.map((c) => ({ color: c, share: left * weight(c) }));
  for (const e of exact) {
    const whole = Math.floor(e.share);
    out[e.color] += whole;
    left -= whole;
  }
  // Whatever is still over goes to whoever was closest to another whole land,
  // which is what makes 9/8 fall out of a pip split rather than being asserted.
  const byRemainder = [...exact].sort(
    (a, b) => b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)),
  );
  for (let i = 0; left > 0; i++, left--) out[byRemainder[i % byRemainder.length].color]++;
  return out;
}

/**
 * Which of the deck's colours it cannot reliably cast, after the split above has
 * already done what it can.
 *
 * Rare by construction, and that is the point: `splitBasics` pays every floor it
 * can afford, so anything left here is a deck asking for more colour than
 * sixteen or seventeen lands can serve. An advisory that fired on ordinary
 * two-colour decks would be noise, and the first version of this did.
 *
 * A source is a basic of that colour or a nonbasic whose colour identity
 * includes it -- MANA-03 again, and the reason duals are counted rather than
 * netted off somewhere.
 */
function uncastableColors(
  spells: readonly Card[],
  nonbasicLands: readonly Card[],
  basicsByColor: Record<string, number>,
  colors: readonly string[],
): string[] {
  const pips = colorPips(spells);
  const short: string[] = [];

  for (const color of colors) {
    if (!WUBRG.includes(color)) continue;
    const asked = pips.get(color) ?? 0;
    if (asked === 0) continue;

    const sources =
      (basicsByColor[color] ?? 0) +
      nonbasicLands.filter((l) => l.colorIdentity.includes(color as never)).length;
    if (sources < sourceFloor(asked)) short.push(color);
  }
  return short;
}

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

  // How many lands this deck wants is a fact about the spells, and which spells
  // it plays depends on how many slots are left for them -- so the two define
  // each other. Resolved by taking the conventional 23 first and asking the
  // curve THAT produces what it wants, which is the same order a person builds
  // in: fill the deck, look at the top end, adjust. One pass, because the second
  // pass only ever moves one card and a fixed point nobody can predict is worse
  // than a rule anybody can follow.
  //
  // The caller's `spellCount` still wins outright when it is given -- a test or
  // a screen asking for a specific shape is not asking for advice.
  const landCount = (spells: readonly Card[]) =>
    options.spellCount != null ? deckSize - options.spellCount : landsFor(spells);

  // Takes the whole ranked list rather than a pre-cut 23, because how many it
  // cuts to is the question `landsFor` answers and it cannot be asked before the
  // cards are in front of it.
  const fill = (colors: string[], ranked: Card[]): DeckSuggestion => {
    const landSlots = landCount(ranked.slice(0, DECK.spellCount));
    const spells = ranked.slice(0, deckSize - landSlots);
    const nonbasicLands = landPool
      .filter((c) => landFitsColors(c, colors))
      .sort((a, b) => cardValue(b) - cardValue(a))
      .slice(0, Math.min(DECK.maxNonbasicLands, landSlots));

    const basicLands = deckSize - spells.length - nonbasicLands.length;
    const basicsByColor = splitBasics(spells, nonbasicLands, colors, basicLands);

    return {
      colors,
      spells,
      nonbasicLands,
      basicLands,
      curve: curveCounts(spells),
      basicsByColor,
      uncastable: uncastableColors(spells, nonbasicLands, basicsByColor, colors),
    };
  };

  const priced = archetypes != null && measures(archetypes, 2) && measures(archetypes, 3);
  const candidates = priced ? [...COLOR_SETS.pairs, ...COLOR_SETS.triples] : COLOR_SETS.pairs;

  let best: DeckSuggestion | undefined;
  let bestTotal = -Infinity;

  for (const colors of candidates) {
    const ranked = spellPool
      .filter((c) => fitsColors(c, colors))
      .sort((a, b) => cardValue(b) - cardValue(a));
    // Colour sets are compared over the SAME number of cards, always the
    // conventional 23, whatever each would end up playing. Comparing a 24-card
    // deck against a 23-card one adds a card's worth of win rate to whichever
    // happened to want more spells, which would make the land rule quietly a
    // colour-choosing rule as well.
    const playable = ranked.slice(0, spellCount);
    if (playable.length < spellCount / 2) continue;
    const width = priced ? splashCost(archetypes!, colors.length) : 0;
    const total = playable.reduce((s, c) => s + cardValue(c) - width, 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = fill(colors, ranked);
    }
  }

  if (!best) best = fill([], [...spellPool].sort((a, b) => cardValue(b) - cardValue(a)));
  return best;
}
