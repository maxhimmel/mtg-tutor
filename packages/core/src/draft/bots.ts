import type { EngineCard } from "../model/card.js";
import { cardValue } from "../scoring/value.js";

// A bot commits to colors as it drafts: it tracks accumulated value per color
// and biases future picks toward its strongest colors, producing readable
// signals (open colors flow downstream) and meaningful wheels.
//
// WHAT A BOT KNOWS, AND WHAT IT DOES NOT
//
// `colorValue` accumulates from the bot's OWN picks only. Nothing a bot sees and
// passes ever reaches it, so the pod emits signals downstream and no seat can
// read one -- see roadmap `human-bots` in notes.md, which is about closing that.
//
// TWO THINGS THAT CANNOT CHANGE WITHOUT STRANDING DRAFTS
//
// Bots pick by `cardValue`, so what a bot takes decides what wheels back to the
// human. A session is {seed, pickedNames} replayed, so any change to the
// arithmetic below re-deals every stored draft and `replayDraft` starts throwing.
// `corpus.test.ts` is the tripwire. See decision #8 in notes.md.
//
// And the RNG DRAW PATTERN is load-bearing beyond the deal: exactly one `rng()`
// per card in hand, unconditionally, with the human drawing none. `forkImpact`
// (draft/diff.ts) is sound only because that makes the stream position invariant
// under a swapped pick. Draw a different number of times -- even "skip the draw
// when noise is zero" -- and fork weights silently stop measuring anything.

/**
 * What a bot has taken, and the colour lane that falls out of it.
 *
 * Split out of `Bot` so a harness can score the policy against real human picks
 * without driving an engine: `bench-bots` reconstructs this from the `pool_*`
 * columns of the 17Lands draft dataset and asks what the shipped bot would have
 * done. Measuring a reimplementation of the policy instead of the policy is
 * measurement trap #5, so there is deliberately only one copy of this arithmetic.
 */
export class BotMemory {
  private colorValue = new Map<string, number>();
  readonly pool: EngineCard[] = [];

  take(card: EngineCard): void {
    this.pool.push(card);
    const q = Math.max(0, cardValue(card) - 0.5);
    for (const c of card.colors) this.colorValue.set(c, (this.colorValue.get(c) ?? 0) + q);
  }

  colorBias(card: EngineCard): number {
    if (card.colors.length === 0) return 0;
    // Reward the bot's strongest matching color; cap so a real bomb can still
    // pull the bot off its lane, but committed colors are clearly preferred.
    let best = 0;
    for (const c of card.colors) best = Math.max(best, this.colorValue.get(c) ?? 0);
    return Math.min(0.05, best * 0.3);
  }
}

/**
 * What one bot thinks one card is worth, before noise.
 *
 * Pure and separately exported so the benchmark scores the same expression the
 * engine does. Noise stays in `pick` because it is a tie-breaker carrying no
 * information -- a harness measuring how human-like the policy is wants the
 * policy, not the coin flip.
 */
export function botScore(card: EngineCard, memory: BotMemory): number {
  return cardValue(card) + memory.colorBias(card);
}

export class Bot {
  private readonly memory = new BotMemory();

  constructor(private readonly noise: number = 0.01, private readonly rng: () => number = Math.random) {}

  get pool(): readonly EngineCard[] {
    return this.memory.pool;
  }

  pick(pack: EngineCard[]): EngineCard {
    let best = pack[0];
    let bestScore = -Infinity;
    for (const card of pack) {
      const s = botScore(card, this.memory) + (this.rng() - 0.5) * this.noise;
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }
    this.memory.take(best);
    return best;
  }
}
