import { type DisplayCard, isLand } from "@mtg-tutor/core";
import { type Frame, frameFor } from "./cardFrame";
import { COLOR_NAMES } from "./format";

/**
 * A column of the mana curve, split by colour rather than by card.
 *
 * THE OLD SPLIT WAS ONE SEGMENT PER CARD AND IT SILENTLY LOST BANDS. Each card
 * got `min-h-0.5` with a hairline gap between, inside a bar area of about 36px:
 * twelve cards needed 35 of them and fifteen needed 44, so the last WUBRG band
 * in a full pool's tallest column simply was not drawn while the count printed
 * above it still said fifteen. Nothing about that looks broken from a chair.
 *
 * Grouping by colour fixes it twice over. It caps the band count at what a pool
 * actually contains -- two or three in most columns -- and it drops the gaps,
 * which is what makes the arithmetic exact: the bands are shares of one bar and
 * sum to it, so a band can be thin but never absent. And it is the better
 * reading anyway. The number of cards is already printed above the column; what
 * the drawing is for is the PROPORTION, which is the thing three blue and two
 * red says and five off-colour cards do not.
 *
 * Grouped by the same colours `frameFor` paints from -- identity for a land,
 * printed colours for anything else -- and painted by handing it a card out of
 * the group, so a band is exactly the ring on the placards it stands for. There
 * is no second colour table to drift.
 */

const WUBRG = ["W", "U", "B", "R", "G"];

export interface ColorBand {
  /** WUBRG-ordered colour letters, empty for a colourless card. */
  key: string;
  count: number;
  /** The ring paint from `cardFrame`: a flat colour, or a gradient for a pair. */
  frame: Frame;
  /** Said out loud: "Blue", "Blue/Black", "Colorless". */
  name: string;
}

const colorsOf = (card: DisplayCard): string[] => {
  const colors = frameColorsOf(card);
  return WUBRG.filter((c) => colors.includes(c));
};

// `frameFor`'s own precedence, through `isLand` rather than a second test of
// the type line: a land produces mana without being coloured, so its printed
// colours are empty and every land would otherwise band as colourless.
const frameColorsOf = (card: DisplayCard): readonly string[] =>
  isLand(card) ? card.colorIdentity : card.colors;

const nameOf = (colors: string[]): string =>
  colors.length === 0
    ? "Colorless"
    : colors.map((c) => COLOR_NAMES[c] ?? c).join("/");

/**
 * The bands in one column, in WUBRG order.
 *
 * Ordered by colour and never by pick order, for the reason the old sort gave:
 * a stack that reshuffles as picks arrive reads as movement where nothing has
 * moved. Colourless sorts last because it is the absence of the key everything
 * else is sorted on, and mixing it in among the pairs would put a grey band
 * between two golds.
 */
export function colorBands(cards: readonly DisplayCard[]): ColorBand[] {
  const groups = new Map<string, { colors: string[]; cards: DisplayCard[] }>();

  for (const card of cards) {
    const colors = colorsOf(card);
    const key = colors.join("");
    const group = groups.get(key) ?? { colors, cards: [] };
    group.cards.push(card);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([key, group]) => ({
      key,
      count: group.cards.length,
      frame: frameFor(group.cards[0]),
      name: nameOf(group.colors),
    }));
}

// Mono colours in WUBRG order, then the multicolour cards, then colourless.
const rank = (key: string): number => {
  if (key.length === 0) return 99;
  if (key.length > 1) return 90;
  return WUBRG.indexOf(key);
};

/**
 * What a column says when you point at it: the colours, then the cards.
 *
 * The counts lead because they are the reading -- "three blue, two red" is the
 * sentence the bands are drawing -- and the names follow because they are the
 * thing a pointer can ask for and a printed chart has no room for. Both halves
 * are longer forms of something already on screen or in the column's accessible
 * name; nothing here is the only place a fact lives.
 */
export function sayColumn(cards: readonly DisplayCard[]): string {
  const bands = colorBands(cards);
  if (bands.length === 0) return "";
  const split = bands.map((b) => `${b.count} ${b.name}`).join(", ");
  return `${split} — ${cards.map((c) => c.name).join(", ")}`;
}
