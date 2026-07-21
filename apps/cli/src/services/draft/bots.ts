import type { Card } from "../../core/model/card.js";
import { cardValue } from "../../core/scoring/value.js";

// A bot commits to colors as it drafts: it tracks accumulated value per color
// and biases future picks toward its strongest colors, producing readable
// signals (open colors flow downstream) and meaningful wheels.
export class Bot {
  private colorValue = new Map<string, number>();
  readonly pool: Card[] = [];

  constructor(private readonly noise: number = 0.01, private readonly rng: () => number = Math.random) {}

  private colorBias(card: Card): number {
    if (card.colors.length === 0) return 0;
    // Reward the bot's strongest matching color; cap so a real bomb can still
    // pull the bot off its lane, but committed colors are clearly preferred.
    let best = 0;
    for (const c of card.colors) best = Math.max(best, this.colorValue.get(c) ?? 0);
    return Math.min(0.05, best * 0.3);
  }

  pick(pack: Card[]): Card {
    let best = pack[0];
    let bestScore = -Infinity;
    for (const card of pack) {
      const s = cardValue(card) + this.colorBias(card) + (this.rng() - 0.5) * this.noise;
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }
    this.take(best);
    return best;
  }

  private take(card: Card) {
    this.pool.push(card);
    const q = Math.max(0, cardValue(card) - 0.5);
    for (const c of card.colors) this.colorValue.set(c, (this.colorValue.get(c) ?? 0) + q);
  }
}
