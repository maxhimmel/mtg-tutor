import { DECK } from "../config.js";
import type { Card } from "../model/card.js";
import { isBasicLand, isLand } from "../model/card.js";
import { cardValue } from "../scoring/value.js";

export interface DeckSuggestion {
  colors: string[];
  spells: Card[]; // nonland playables
  nonbasicLands: Card[]; // drafted lands that take land slots, not spell slots
  basicLands: number; // basics to add on top
}

const COLOR_PAIRS = (() => {
  const cols = ["W", "U", "B", "R", "G"];
  const pairs: string[][] = [];
  for (let i = 0; i < cols.length; i++)
    for (let j = i + 1; j < cols.length; j++) pairs.push([cols[i], cols[j]]);
  return pairs;
})();

const fitsColors = (c: Card, colors: string[]) =>
  c.colors.length === 0 || c.colors.every((col) => colors.includes(col));

// Lands print colorless, so their `colors` says nothing -- a Boros tapland is
// only playable in a Boros deck by its color identity.
const landFitsColors = (c: Card, colors: string[]) =>
  c.colorIdentity.every((col) => colors.includes(col));

// Pick the two-color pair whose on-color playables have the highest total value,
// then take the best spells in those colors and fill the land slots.
export function suggestDeck(
  pool: Card[],
  spellCount = DECK.spellCount,
  deckSize = DECK.size,
): DeckSuggestion {
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
    };
  };

  let best: DeckSuggestion | undefined;
  let bestTotal = -Infinity;

  for (const colors of COLOR_PAIRS) {
    const playable = spellPool
      .filter((c) => fitsColors(c, colors))
      .sort((a, b) => cardValue(b) - cardValue(a))
      .slice(0, spellCount);
    if (playable.length < spellCount / 2) continue;
    const total = playable.reduce((s, c) => s + cardValue(c), 0);
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
