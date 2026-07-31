import { isLand } from "./card.js";

// Splits a printed mana cost into its symbols: "{2}{W/U}{X}" -> ["2", "W/U", "X"].
// Anything outside braces is dropped, which is what makes a split card's
// "{1}{U} // {3}{U}" come back as one flat list of symbols to draw.
export function parseManaCost(cost?: string): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

// The curve asks one question -- on which turn can this deck act -- so the
// buckets are turns, not costs. A free spell is cast on turn one alongside the
// one-drops, and everything past six is the same answer: you are waiting.
export const CURVE_TOP = 6;

export interface CurveBucket<C> {
  turn: number;
  label: string;
  cards: C[];
}

/**
 * The pool's spells by the turn they come down on, every bucket present whether
 * or not it holds anything -- the shape is the thing being read, and a chart
 * that drops its empty columns redraws its own axis on every pick.
 *
 * Lands are left out. They are what pays for the curve rather than part of it.
 */
export function manaCurve<C extends { cmc: number; typeLine: string }>(
  cards: readonly C[],
): CurveBucket<C>[] {
  const buckets: CurveBucket<C>[] = Array.from({ length: CURVE_TOP }, (_, i) => ({
    turn: i + 1,
    label: i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : String(i + 1),
    cards: [],
  }));

  for (const card of cards) {
    if (isLand(card)) continue;
    const turn = Math.min(CURVE_TOP, Math.max(1, Math.ceil(card.cmc)));
    buckets[turn - 1].cards.push(card);
  }
  return buckets;
}
