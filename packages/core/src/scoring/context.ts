import type { CardContext, ColorCode, ColorWinRate, EngineCard } from "../model/card.js";
import type { DeckNeeds } from "./tiebreak.js";
import { SCORING } from "../config.js";
import { cardValue } from "./value.js";

// What a card is worth to THIS deck, as distinct from what it is worth.
//
// `cardValue` is the card on its own and is deliberately frozen -- bots pick by
// it, so it decides the deal and cannot move without stranding every stored
// draft. Everything context-dependent lives here instead, where it is free to
// change forever.
//
// Every term is in win-rate points, the same units `cardValue` returns, so a gap
// between two cards stays comparable and SCORING.winRateGapK keeps its meaning.

const WUBRG: ColorCode[] = ["W", "U", "B", "R", "G"];

// Whether a card belongs to what the pool is building. Before any commitment
// nothing can be off-color -- early picks are expendable and staying open is
// correct -- and a colorless card fits whatever the pool becomes.
//
// Shared rather than inlined because the prompt says this out loud ("this pick
// is OFF those colors") next to the colors it computed, and the two saying
// different things is the bug that sentence is most able to hide.
//
// It lived in `score.ts` until `offColorCost` below needed it, and score.ts
// imports this file -- so it moved down rather than being copied up, which is
// what the paragraph above exists to forbid. `score.ts` re-exports it.
export function isOnColor(committed: ReadonlySet<ColorCode>, colors: readonly ColorCode[]): boolean {
  return committed.size === 0 || colors.length === 0 || colors.some((c) => committed.has(c));
}

/** Canonical colour string, matching how 17Lands keys an archetype. */
export function colorKey(colors: Iterable<ColorCode>): string {
  const held = new Set(colors);
  return WUBRG.filter((c) => held.has(c)).join("");
}

/**
 * The format's own win rate, from the archetype table.
 *
 * 17Lands players beat the field -- SOS TradDraft sits at 0.608, not 0.5 -- so
 * anything comparing a rate to a 50%-centred baseline is wrong by ten points
 * before it starts. Derived here rather than stored because the archetype table
 * is already on the pick path and this is just its weighted mean.
 */
export function formatBaseline(archetypes: readonly ColorWinRate[]): number {
  const n = archetypes.reduce((a, c) => a + c.n, 0);
  return n > 0 ? archetypes.reduce((a, c) => a + c.wr * c.n, 0) / n : 0.5;
}

/** How the given archetype did, falling back to the mean at its colour count. */
export function archetypeWinRate(
  archetypes: readonly ColorWinRate[],
  colors: Iterable<ColorCode>,
): number {
  const key = colorKey(colors);
  const exact = archetypes.find((a) => a.colors === key);
  if (exact) return exact.wr;
  return winRateAtWidth(archetypes, key.length);
}

// Sample-weighted, never a plain mean: a five-colour archetype with 240 games
// would otherwise count as much as a two-colour one with 167,000.
function winRateAtWidth(archetypes: readonly ColorWinRate[], width: number): number {
  const at = archetypes.filter((a) => a.colors.length === width);
  if (at.length === 0) return formatBaseline(archetypes);
  const n = at.reduce((a, c) => a + c.n, 0);
  return at.reduce((a, c) => a + c.wr * c.n, 0) / n;
}

/**
 * What widening to `width` colours costs, in win-rate points.
 *
 * Measured per set, never assumed. Three colours runs -4.3pp against two in fdn
 * and -0.3pp in snc, where 60% of the field is doing it -- so a fixed penalty
 * for splashing is wrong in both directions depending on the set, and there is
 * nothing here to tune.
 *
 * Two colours is the reference because it is what a Limited deck is by default.
 * Going narrower is not a saving: mono-colour decks are their own strategy and
 * measure worse than pairs about as often as better, so this floors at zero.
 */
export function splashCost(archetypes: readonly ColorWinRate[], width: number): number {
  if (width <= 2) return 0;
  // Monotone in width, and it has to be enforced rather than assumed. A width
  // nobody played falls back to the format's own rate, which is HIGHER than a
  // measured wider archetype -- so a five-colour deck nobody drafted would come
  // out cheaper than the four-colour one that was, and the marginal step into
  // it would read as a discount. Found in a stored pick paying +1.5pp to add a
  // colour.
  let worst = 0;
  for (let w = 3; w <= width; w++) {
    worst = Math.max(worst, winRateAtWidth(archetypes, 2) - winRateAtWidth(archetypes, w));
  }
  return Math.max(0, worst);
}

const COLOR_SETS = (() => {
  const pairs: ColorCode[][] = [];
  const triples: ColorCode[][] = [];
  for (let i = 0; i < WUBRG.length; i++)
    for (let j = i + 1; j < WUBRG.length; j++) {
      pairs.push([WUBRG[i], WUBRG[j]]);
      for (let k = j + 1; k < WUBRG.length; k++) triples.push([WUBRG[i], WUBRG[j], WUBRG[k]]);
    }
  return { pairs, triples };
})();

// Whether the table prices this exact width, rather than falling back to a mean.
//
// `splashCost` answers for any width, because the pick path needs an answer for
// the deck it is actually in. CHOOSING to go wider is a different question: an
// unmeasured width falls back to the format's own rate, which the two-colour
// decks it is being compared against dominate, so the gap collapses and the
// extra colour reads as nearly free. Both sides of the comparison have to have
// been played by somebody for the difference between them to be a measurement.
//
// The width itself, not "something at least this wide". A format with three-
// and five-colour rows and nothing at four says nothing about four.
const measures = (archetypes: readonly ColorWinRate[], width: number) =>
  archetypes.some((a) => a.colors.length === width);

/**
 * Which deck this pile of cards is becoming: the colour set whose best
 * `spellCount` castable cards are worth the most, after paying for its width.
 *
 * WHY THIS EXISTS RATHER THAN `committedColors`
 *
 * `committedColors` is a rule about a DECK -- two or more of a colour in the
 * forty -- and decision #16 is that it is the one rule for a deck's colours.
 * That ruling is untouched. What was wrong is that the SCORER was asking it
 * about a POOL, and over a pool it answers a different question: two copies of
 * anything clears the bar, so by the last pick it calls 82% of real 17Lands
 * pools four or five colours and only 1.7% of them two, while the top two
 * colours hold 84.5% of the pool's value. Measured over 12,000 drafts across
 * eight sets by `scripts/diagnose-offcolour.mjs`'s cache.
 *
 * Every colour term downstream reads that set, so a five-colour answer switched
 * all of them off at once and none of them said so: nothing is off-colour when
 * you are in every colour, `splashCost` charges nothing to widen a deck already
 * priced at five, `commitment`'s value share pins at ~1.0 because no card is
 * outside, and `archDelta` looks up "WUBRG" -- an archetype almost nobody
 * drafted. That is the whole of notes.md issues #4, #18 and #6: the app holding
 * up a card the deck cannot cast, having charged it nothing, because by its own
 * reckoning the deck was in that colour.
 *
 * NOT A CAP, WHICH DECISION #16 FORBIDS AND MEANT
 *
 * The count is not fixed at two. It is whatever the archetype table can price:
 * a three-colour set wins here whenever its 23 best cards beat the pair's by
 * more than the measured cost of the third colour, which in snc (-0.3pp) is
 * most of the time and in fdn (-4.3pp) is rare. The width is read off the set,
 * exactly as `splashCost` is.
 *
 * THE SAME CHOICE `suggestDeck` ALREADY MAKES
 *
 * The deck builder has ranked all twenty candidate colour sets this way since it
 * was written; this is that loop, lifted out so the scorer and the builder
 * cannot answer differently. Two authorities over one pool is the failure
 * `ScoringContext.needs` already has a paragraph about, and it would have been
 * worse here -- the grade and the deck the grade is about.
 *
 * Lands are the caller's to exclude: `suggestDeck` holds whole cards and tests
 * the type line, the pick path holds engine cards and has `role`. One predicate
 * here would have to pick one of those and be wrong for the other caller.
 *
 * WHAT IT IS STILL WRONG ABOUT, AND WHY THAT WAS LEFT ALONE
 *
 * Candidates are ranked on the cards the pool HAS, so while the pool is short of
 * `spellCount` a wider set can win on slots that were counting as nothing rather
 * than on cards. `DeckOptions.archetypes` already names this shape for the case
 * where width cannot be priced at all, and mid-draft it is every comparison --
 * so the colours run wider at pick 15 than at pick 40.
 *
 * Padding the missing slots with a replacement card was tried and put back.
 * There is no honest value for one: `formatBaseline` sits at about the median
 * card, which makes a colour set you hold THREE cards in beat one you hold
 * twenty-four mediocre cards in -- it is credited twenty slots of median value
 * it has no way to fill. The number that would work is what you will actually
 * draft into those slots, and that depends on what is open, which is the thing
 * nothing here knows. Left as it was rather than replaced with a guess.
 */
export function deckColorsFor(
  spells: readonly EngineCard[],
  archetypes: readonly ColorWinRate[],
  spellCount: number,
): ColorCode[] {
  // No cards, no deck. Every candidate would otherwise total zero and the first
  // pair in WUBRG order would win the tie, so an empty pool came out committed
  // to WU -- harmless downstream only because `commitment` is 0 there too, which
  // is exactly the kind of accident that stops being harmless when someone reads
  // the colours for something else.
  if (spells.length === 0) return [];

  const priced = measures(archetypes, 2) && measures(archetypes, 3);
  const candidates = priced ? [...COLOR_SETS.pairs, ...COLOR_SETS.triples] : COLOR_SETS.pairs;

  let best: ColorCode[] = [];
  let bestTotal = -Infinity;
  for (const colors of candidates) {
    const playable = spells
      .filter((c) => c.colors.every((col) => colors.includes(col)))
      .sort((a, b) => cardValue(b) - cardValue(a))
      // Compared over the SAME number of cards, always `spellCount`, whatever
      // each would end up playing -- otherwise the comparison adds a card's
      // worth of win rate to whichever colour set happened to want more spells.
      .slice(0, spellCount);
    // Per CARD rather than per deck, which is what keeps a splash you cannot
    // fill from paying a whole deck's width. See `deck.test.ts`, which pins it.
    const width = priced ? splashCost(archetypes, colors.length) : 0;
    const total = playable.reduce((s, c) => s + cardValue(c) - width, 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = colors;
    }
  }
  return best;
}

/**
 * How committed the deck is to its colours, 0-1, and therefore how much any
 * context term is worth.
 *
 * Both halves are needed. Sixty percent of your value in WB means little at pick
 * 5 and a great deal at pick 30, so the share is scaled by how much of the draft
 * has happened. At P1P1 it is 0, which is what makes "too early to say" fall out
 * of the derivation rather than being a threshold someone picked.
 *
 * Value share rather than card count: a bomb commits you harder than a filler,
 * and counting cards says they commit you the same.
 */
export function commitment(
  maindeck: readonly EngineCard[],
  colors: ReadonlySet<ColorCode>,
  picksMade: number,
  totalPicks: number,
): number {
  if (maindeck.length === 0 || totalPicks <= 0) return 0;

  let inColors = 0;
  let total = 0;
  for (const card of maindeck) {
    const v = cardValue(card);
    total += v;
    // Colourless cards are playable in any deck, so they neither commit you to
    // a colour nor argue against one -- counting them as on-colour keeps them
    // from diluting a share they have no opinion about.
    if (card.colors.length === 0 || card.colors.some((c) => colors.has(c))) inColors += v;
  }

  const share = total > 0 ? inColors / total : 0;
  return share * Math.min(1, picksMade / totalPicks);
}

export interface ScoringContext {
  /** The colours the maindeck has committed to. */
  colors: ReadonlySet<ColorCode>;
  /** 0-1, from `commitment`. Scales every pool-dependent term. */
  commitment: number;
  /** The set's archetype table, at every colour count. */
  archetypes: readonly ColorWinRate[];
  /** Per-card context, by the same normalised key `setCardContext` is keyed on. */
  contextFor: (card: EngineCard) => CardContext | undefined;
  /**
   * What the deck is still short of, and the reason this interface is the right
   * place for it.
   *
   * This began as a separate argument to `challengeFor`, supplied by the browser
   * and impossible for anyone else -- the needs read a curve and a set of roles,
   * which lived on the text half of a card. The result was two authorities over
   * one pack: the grade computed one answer without needs, the challenge another
   * with them, and they disagreed on screen three times.
   *
   * `packScoringContext` exists to stop exactly that, and says so in its own
   * comment. Putting needs anywhere else left it telling half the truth. Here,
   * there is no way to build a context without them and therefore no way for two
   * callers to hold different ones -- the divergence is not fixed, it is
   * unrepresentable.
   */
  needs: DeckNeeds;
}

/** One named contribution, in win-rate points. */
export interface ValueTerm {
  label: string;
  delta: number;
}

export interface ContextValue {
  /** `cardValue` plus every term below. */
  value: number;
  /** What the card is worth on its own. */
  base: number;
  /** Non-zero contributions, largest first. A score you cannot interrogate is
   *  worse than a simple one. */
  terms: ValueTerm[];
}

/**
 * How much better this card is INSIDE this archetype than its overall rate
 * already implies.
 *
 * Both halves are recentred on their own population, which is the whole point.
 * A card's win rate inside a three-colour archetype is depressed partly because
 * three-colour decks win less -- and `splashCost` already charges for that, so
 * subtracting the archetype's own rate is what stops it being charged twice.
 * Subtracting the card's general standing is what stops a good card reading as
 * a good FIT everywhere.
 */
export function archDelta(
  ctx: ScoringContext,
  card: EngineCard,
  context: CardContext | undefined,
): number {
  const inArchetype = context?.archWr?.[colorKey(ctx.colors)];
  if (inArchetype == null) return 0;

  const archetype = archetypeWinRate(ctx.archetypes, ctx.colors);
  const overall = cardValue(card);
  const base = formatBaseline(ctx.archetypes);
  return inArchetype - archetype - (overall - base);
}

// IWD is stored and deliberately not scored, for the same reason `speed` is not:
// the data cannot say how much of it to count.
//
// The measurement argument is sound -- GIH WR confounds a card with the decks
// that played it, and IWD subtracts the same decks' win rate in the games they
// did not draw it, so deck quality cancels. What that does not give is a WEIGHT.
// The first attempt derived one from corr(gihWr, iwd) = 0.793, reasoning that
// r^2 = 0.63 is redundant so 0.37 is new. That is wrong: how redundant a signal
// is says nothing about how much it should move an answer. At 0.37 it made the
// scorer disagree with what 3-0 drafters took in 16 of 17 sets.
//
// It needs an objective that is about card quality rather than about what
// drafters do -- see the circularity note in scripts/backtest-scoring.mjs.

/**
 * What a card the deck is not going to play is worth to it.
 *
 * THE CLAIM `splashCost` MAKES, AND WHERE IT STOPS BEING TRUE
 *
 * `splashCost` is a measured number and it is not wrong -- it is the win rate a
 * deck gave up by running three colours instead of two, and for a drafter who
 * is genuinely deciding whether to widen it is exactly the right charge. But it
 * is measured over decks that PLAYED the extra colour, so quoting it assumes
 * the card ends up in the forty. At P3P9 in front of a finished two-colour
 * deck, that assumption is simply false: the card is going to the sideboard,
 * and what it costs you is not four points of win rate, it is everything.
 *
 * That is the whole of notes.md issues #4 and #18. A black land held up against
 * a nine-card UG pool and a green frog held up against a finished deck are the
 * same sentence -- the scorer pricing a bench card as though it were a splash,
 * and finding it a bargain, because at 4.3pp the toll is smaller than the win
 * rate gaps it is competing against. Measured over 160,184 real picks before
 * this existed: drafters take an off-colour card 2.3% of the time in pack 3 and
 * the scorer nominated one 12.4% of the time, having charged it 0.43pp.
 *
 * SO THE TERM IS NOT A BIGGER TOLL
 *
 * Raising `splashCost` would be answering a measurement with a knob, and it
 * would be wrong at P1P5 where widening is free and correct. What changes with
 * the draft is not the price of a colour, it is the PROBABILITY the card is
 * ever cast -- and `commitment` is already this app's measure of that, on a
 * 0-1 scale, built out of value share and progress for exactly this purpose.
 *
 * A card that does not make your deck leaves your deck where it was, so it is
 * worth "nothing you did not already have" -- which decision #10 already puts a
 * number on. `SCORING.basicLandValue` is 0 and its comment says why: every other
 * card's value answers "how much better is a deck with this in it", and for a
 * card that is never in the deck the answer is zero by construction. A card you
 * cannot cast is the same card as a Mountain, one level up.
 *
 * SO THE ANCHOR IS ZERO, AND FOR A FORTNIGHT IT WAS THE FORMAT BASELINE
 *
 * That was wrong, and wrong in a way that made this term almost never fire.
 * `formatBaseline` is a mean over DECK win rates and `cardValue` is a CARD's win
 * rate; the two are numerically similar and answer different questions. Measured
 * across all eighteen sets, the baseline sits at the 31st to 50th percentile of
 * the set's own card values -- it IS about the median card. So the old term
 * charged an off-colour card at most its excess over a median playable, which is
 * nothing for the half of the set below it and a point or two for the rest.
 * Over 609,630 real picks it charged 1.28pp against a 3.90pp winning margin,
 * and the two reports in notes.md #6 are both cards it charged nothing at all.
 *
 * `trapCorrection` below still shrinks toward the baseline and still should:
 * it distrusts a MEASUREMENT and pulls it back toward the population it was
 * measured in. This one believes the measurement and says the card is in the
 * wrong deck. They were never the same anchor; they only looked like it.
 *
 * WHAT THE MEASUREMENT SAYS ABOUT THE SCALING, AND WHY IT IS STILL COMMITMENT
 *
 * `commitment` is how sure we are the colours are settled, so `1 - commitment`
 * is what is left of an off-colour card. Measured against what actually happens
 * -- take a card off your colours now, does the deck you finish with cast it --
 * that is generous, not harsh: the real rate runs 0.71 at commitment under 0.1,
 * 0.25 through the middle of the draft and 0.02 past 0.8, where `1 - commitment`
 * offers 0.95, 0.65 and 0.15. Charging the measured rate instead was declined:
 * it is observational, it only sees the off-colour cards drafters CHOSE to take,
 * and erring toward keeping a pivot open is the right direction to be wrong in.
 *
 * One-sided is gone with the baseline. There is nothing below zero to protect
 * against, and the guard was what excluded every below-median card.
 *
 * At zero commitment it is zero, so nothing about the early draft moves -- P1P1
 * still has no opinion about colours, which is what makes staying open free.
 */
function offColorCost(ctx: ScoringContext, card: EngineCard): number {
  if (isOnColor(ctx.colors, card.colors)) return 0;
  return ctx.commitment * cardValue(card);
}

/**
 * How much of a card's win rate to believe.
 *
 * A card taken and then left out of the deck was played in the games someone
 * judged it good for. Its win rate is measured on that sample, so it FLATTERS
 * the card -- and only in that direction.
 *
 * One-sided for exactly that reason. Self-selection is a directional bias, not
 * noise: shrinking symmetrically would also push a weak unplayed card UP toward
 * the baseline, as though not being played were evidence it is better than it
 * looks. The first version of this did, and the trophy-pick backtest found it.
 * Sample noise is a different problem and `cardValue` already handles it with
 * `gihGames`.
 */
function trapCorrection(
  card: EngineCard,
  context: CardContext | undefined,
  baseline: number,
): number {
  const rate = context?.maindeckRate;
  if (rate == null || rate >= SCORING.maindeckTrustFloor) return 0;
  const value = cardValue(card);
  if (value <= baseline) return 0;
  const distrust = (SCORING.maindeckTrustFloor - rate) / SCORING.maindeckTrustFloor;
  return (baseline - value) * distrust;
}

/**
 * One standard error on the gap between two cards, from the pick path's own
 * data -- the same quantity `gapMargin` computes in the browser, reachable by
 * the engine.
 *
 * `gapMargin` takes whole `Card`s and reads `gihWinRate` and `gihGames`, which
 * left the engine's half of a card when the pool was split. So the verdict could
 * say "the data cannot tell these two apart" while the grade underneath it,
 * computed where those fields do not exist, charged for the difference anyway.
 * This is that number where the grade can reach it.
 *
 * Undefined when either card is unrated, and that is the whole rule rather than
 * an edge case: a rarity baseline has no sample to have error bars over, so
 * there is no margin -- and therefore no claim that the two cards are the same.
 * Saying nothing is honest where inventing a margin is not.
 *
 * One standard error and not two, for the reason `gapMargin` gives: the question
 * is whether the data can separate the cards at all, not whether it can at 95%
 * confidence, and a 2-sigma band would call almost every pick in the format a
 * tie.
 */
export function marginBetween(
  ctx: ScoringContext,
  a: EngineCard,
  b: EngineCard,
): number | undefined {
  const sa = ctx.contextFor(a)?.se;
  const sb = ctx.contextFor(b)?.se;
  if (sa == null || sb == null) return undefined;
  return Math.sqrt(sa * sa + sb * sb);
}

export function contextValue(card: EngineCard, ctx: ScoringContext): ContextValue {
  const base = cardValue(card);
  const context = ctx.contextFor(card);
  const baseline = formatBaseline(ctx.archetypes);

  // What this card would make the deck, if taken.
  const widened = new Set(ctx.colors);
  for (const c of card.colors) widened.add(c);
  // Floored: widening the deck is never a saving, whatever the archetype table
  // happens to say about a width few people drafted.
  const splash = Math.max(
    0,
    splashCost(ctx.archetypes, widened.size) - splashCost(ctx.archetypes, ctx.colors.size),
  );

  // `splash` and `off-color` both answer "what does this card's colour cost
  // you", and they do not double-charge: `splashCost` floors at width 2 and an
  // off-colour card is by definition adding a colour, so the deck it is priced
  // against is a wider one either way. What separates them is which future they
  // are about. `splash` is the price of the deck you would become; `off-color`
  // is the price of not becoming it, which is the one nothing was charging.
  const terms: ValueTerm[] = [
    { label: "archetype", delta: ctx.commitment * archDelta(ctx, card, context) },
    { label: "splash", delta: -ctx.commitment * splash },
    { label: "off-color", delta: -offColorCost(ctx, card) },
    { label: "trust", delta: trapCorrection(card, context, baseline) },
  ].filter((t) => t.delta !== 0);

  terms.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { value: base + terms.reduce((a, t) => a + t.delta, 0), base, terms };
}
