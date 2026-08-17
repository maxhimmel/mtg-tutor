import type { EngineCard, SetData } from "../model/card.js";
import { DRAFT, PACK } from "../config.js";
import { mulberry32 } from "../util/rng.js";
import { packCards, unpackCards, type PackedCards } from "../model/packedCards.js";
import { makePacks } from "./pack.js";

// Every booster a draft will ever open, settled once, before the first pick.
//
// WHY THIS EXISTS AT ALL
//
// A session used to be {seed, pickedNames} replayed against WHATEVER THE SET
// SAYS TODAY. That made re-ingesting a set a destructive act: the packs a stored
// draft saw stopped existing, and nothing could repair them. `sourceHash`,
// `staleAgainst` and "this draft can no longer be rebuilt" were all written to
// cope with a hazard that only existed because the deal was not written down.
// A draft that carries its own boosters cannot strand.
//
// It is also what takes the card pool off the request path. Only 50-64% of a set
// ever appears in any of the 24 boosters -- measured across all 18 ingested sets
// -- so replaying against the whole set read 100+ cards this draft could never
// contain, on every one of 42 picks.
//
// TWO STREAMS, WHICH IS THE OTHER HALF OF THE POINT
//
// Dealing and bot noise used to draw from ONE stream, and `openPack` ran at the
// start of each round -- so round 2's boosters depended on how many numbers the
// bots had consumed in round 1. `bots.ts` documents the discipline that kept
// `forkImpact` sound under that arrangement: exactly one draw per card in hand,
// unconditionally, so a swapped human pick leaves the stream position alone.
// That invariant was maintained by hand and any bot change could quietly break
// it.
//
// Here the deal draws from its own stream and finishes before the draft starts.
// A counterfactual replay CANNOT re-deal, whatever the bots do, because the
// boosters are data rather than a position in a shared stream. The bots keep
// their one-draw-per-card rule, which now protects only their own stream.
const BOT_STREAM = 0x9e3779b9;

export const dealRng = (seed: number) => mulberry32(seed);
export const botRng = (seed: number) => mulberry32((seed ^ BOT_STREAM) >>> 0);

/** `rounds[packNo - 1][seat]` is the booster that seat opens in that round. */
export interface Deal {
  rounds: EngineCard[][][];
}

export function dealDraft(set: SetData, seed: number): Deal {
  const rng = dealRng(seed);
  return {
    rounds: Array.from({ length: PACK.packsPerDraft }, () =>
      makePacks(set, DRAFT.seats, rng),
    ),
  };
}

/** Cards per booster, and so picks per pack, read off the deal itself. */
export function dealPackSize(deal: Deal): number {
  return deal.rounds[0]?.[0]?.length ?? 0;
}

export function dealTotalPicks(deal: Deal): number {
  return deal.rounds.reduce((n, round) => n + (round[DRAFT.humanSeat]?.length ?? 0), 0);
}

/**
 * A deal as it is stored: the cards once, and the boosters as positions in them.
 *
 * The same card is dealt to several seats and several rounds -- 24 boosters hold
 * ~336 cards drawn from ~170 distinct ones -- so storing whole cards per booster
 * would write each popular common a dozen times. Indices cost ~3 bytes where a
 * card costs ~56 packed, which is what keeps a stored deal near the size of the
 * slice it refers to rather than double it.
 */
export interface PackedDeal {
  cards: PackedCards;
  rounds: number[][][];
}

export function packDeal(deal: Deal): PackedDeal {
  // Identity, not name: two printings can share a name, and the engine compares
  // by name only ever WITHIN one pack. Across a deal, the object a booster holds
  // is the thing that must come back.
  const index = new Map<EngineCard, number>();
  const cards: EngineCard[] = [];
  const positionOf = (card: EngineCard): number => {
    const at = index.get(card);
    if (at !== undefined) return at;
    const next = cards.length;
    index.set(card, next);
    cards.push(card);
    return next;
  };

  return {
    rounds: deal.rounds.map((round) => round.map((booster) => booster.map(positionOf))),
    cards: packCards(cards),
  };
}

export function unpackDeal(packed: PackedDeal): Deal {
  const cards = unpackCards(packed.cards);
  return {
    rounds: packed.rounds.map((round) =>
      round.map((booster) =>
        booster.map((at) => {
          const card = cards[at];
          if (!card) {
            // A booster naming a card the slice does not hold means the two were
            // written by different passes. Loud, because the alternative is a
            // pack with a hole in it that scores as though the card were free.
            throw new Error(
              `Stored deal refers to card ${at}, but its pool holds ${cards.length}.`,
            );
          }
          return card;
        }),
      ),
    ),
  };
}
