import { isLand } from "./card.js";

// Splits a printed mana cost into its symbols: "{2}{W/U}{X}" -> ["2", "W/U", "X"].
// Anything outside braces is dropped, which is what makes a split card's
// "{1}{U} // {3}{U}" come back as one flat list of symbols to draw.
export function parseManaCost(cost?: string): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

function symbolValue(symbol: string): number {
  if (symbol === "X" || symbol === "Y" || symbol === "Z") return 0;
  // A hybrid symbol is worth the most it can cost: {2/W} is two, {W/U} is one.
  const numbers = symbol.split("/").map(Number).filter(Number.isFinite);
  return numbers.length > 0 ? Math.max(...numbers) : 1;
}

/**
 * What a card costs to cast, which for a split card is not its mana value.
 *
 * Scryfall reports a split card's COMBINED value -- Dazzling Theater // Prop
 * Room is 7, being {3}{W} plus {2}{W} -- and nobody has ever paid that. Left
 * alone it put all 29 split cards in the sets we hold into the seven- and
 * eight-drop buckets, which is a shape no Limited deck has ever had.
 *
 * The `cmc` it is reading around is not wrong and is not changed: it is what
 * Scryfall says, it is what the stored card carries, and a rules-correct mana
 * value is the right thing for anything asking about the card rather than about
 * casting it.
 *
 * What separates a split card from an adventure is arithmetic rather than a
 * layout field: a split card's mana value is the SUM of its halves, while an
 * adventure's is already its front face's. So the printed cost is only read
 * when it accounts for the whole of `cmc` -- which is also why this works on
 * pools ingested before anything recorded a layout.
 */
export function castingValue(card: { cmc: number; manaCost?: string }): number {
  const halves = (card.manaCost ?? "").split("//");
  if (halves.length !== 2) return card.cmc;

  const values = halves.map((half) =>
    parseManaCost(half).reduce((n, s) => n + symbolValue(s), 0),
  );
  if (values[0] + values[1] !== card.cmc) return card.cmc;
  return Math.min(values[0], values[1]);
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
/**
 * Which curve bucket a card comes down in, 1..CURVE_TOP.
 *
 * Extracted so the chart, the deck builder and the pick path cannot each hold
 * their own copy of it -- `tiebreak` had a second one, and two conventions for
 * when a card comes down is one more than the subject supports. It is also what
 * ingest stores on `EngineCard.turn`, so the number a bot-side reader sees is
 * the number the chart drew.
 */
export const curveTurn = (card: { cmc: number; manaCost?: string }): number =>
  Math.min(CURVE_TOP, Math.max(1, Math.ceil(castingValue(card))));

export function manaCurve<C extends { cmc: number; typeLine: string; manaCost?: string }>(
  cards: readonly C[],
): CurveBucket<C>[] {
  const buckets: CurveBucket<C>[] = Array.from({ length: CURVE_TOP }, (_, i) => ({
    turn: i + 1,
    label: i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : String(i + 1),
    cards: [],
  }));

  for (const card of cards) {
    if (isLand(card)) continue;
    buckets[curveTurn(card) - 1].cards.push(card);
  }
  return buckets;
}
