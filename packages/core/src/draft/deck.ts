import type { Card } from "../model/card.js";
import { cardValue } from "../scoring/value.js";

export interface DeckSuggestion {
  colors: string[];
  spells: Card[]; // ~23 nonland playables
  lands: number; // basic lands to add
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

// Pick the two-color pair whose on-color playables have the highest total value,
// then take the best 23 spells in those colors.
export function suggestDeck(pool: Card[], spellCount = 23, deckSize = 40): DeckSuggestion {
  let best: DeckSuggestion | undefined;
  let bestTotal = -Infinity;

  for (const colors of COLOR_PAIRS) {
    const playable = pool
      .filter((c) => fitsColors(c, colors))
      .sort((a, b) => cardValue(b) - cardValue(a))
      .slice(0, spellCount);
    if (playable.length < spellCount / 2) continue;
    const total = playable.reduce((s, c) => s + cardValue(c), 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = { colors, spells: playable, lands: deckSize - playable.length };
    }
  }

  if (!best) {
    const spells = [...pool].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, spellCount);
    best = { colors: [], spells, lands: deckSize - spells.length };
  }
  return best;
}
