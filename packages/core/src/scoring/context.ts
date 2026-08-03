import type { CardContext, ColorCode, ColorWinRate, EngineCard } from "../model/card.js";
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
  return Math.max(0, winRateAtWidth(archetypes, 2) - winRateAtWidth(archetypes, width));
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

/**
 * The correction IWD makes to a win rate that confounds the card with its deck.
 *
 * GIH WR says a card was in hand when games were won; IWD subtracts the win rate
 * of the same decks in the games they did NOT draw it, so deck quality cancels.
 * The two correlate at 0.793 across all 17 sets, which is exactly why this is
 * weighted rather than added whole: r^2 = 0.63 of IWD is already inside the win
 * rate, and only the remaining 0.37 is information `cardValue` does not have.
 */
function iwdCorrection(context: CardContext | undefined): number {
  return context?.iwd == null ? 0 : context.iwd * SCORING.iwdResidualShare;
}

/**
 * How much of a card's win rate to believe.
 *
 * A card taken and then left out of the deck half the time has a win rate
 * measured only on the games someone chose to play it -- a self-selected sample
 * that flatters it. This shrinks such a card toward the format baseline in
 * proportion to how far below the floor it sits, which is the honest shape:
 * not "this card is worse" but "we know less about it than the number suggests".
 */
function trapCorrection(
  card: EngineCard,
  context: CardContext | undefined,
  baseline: number,
): number {
  const rate = context?.maindeckRate;
  if (rate == null || rate >= SCORING.maindeckTrustFloor) return 0;
  const distrust = (SCORING.maindeckTrustFloor - rate) / SCORING.maindeckTrustFloor;
  return (baseline - cardValue(card)) * distrust;
}

export function contextValue(card: EngineCard, ctx: ScoringContext): ContextValue {
  const base = cardValue(card);
  const context = ctx.contextFor(card);
  const baseline = formatBaseline(ctx.archetypes);

  // What this card would make the deck, if taken.
  const widened = new Set(ctx.colors);
  for (const c of card.colors) widened.add(c);
  const splash =
    splashCost(ctx.archetypes, widened.size) - splashCost(ctx.archetypes, ctx.colors.size);

  const terms: ValueTerm[] = [
    { label: "archetype", delta: ctx.commitment * archDelta(ctx, card, context) },
    { label: "splash", delta: -ctx.commitment * splash },
    { label: "trust", delta: trapCorrection(card, context, baseline) },
    { label: "iwd", delta: iwdCorrection(context) },
  ].filter((t) => t.delta !== 0);

  terms.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { value: base + terms.reduce((a, t) => a + t.delta, 0), base, terms };
}
