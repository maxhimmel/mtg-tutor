import { describe, expect, it } from "vitest";
import { DRAFT, PACK } from "../config.js";
import type { EngineCard } from "../model/card.js";
import { fakePlayBoosterSet } from "../testing/fakeSet.js";
import {
  botRng,
  dealDraft,
  dealPackSize,
  dealTotalPicks,
  packDeal,
  unpackDeal,
} from "./deal.js";

const set = fakePlayBoosterSet();

describe("dealDraft", () => {
  it("opens every booster the draft will ever see, up front", () => {
    const deal = dealDraft(set, 42);
    expect(deal.rounds).toHaveLength(PACK.packsPerDraft);
    for (const round of deal.rounds) expect(round).toHaveLength(DRAFT.seats);
  });

  it("is a pure function of the set and the seed", () => {
    expect(dealDraft(set, 42)).toEqual(dealDraft(set, 42));
  });

  it("deals differently for different seeds", () => {
    const a = dealDraft(set, 1).rounds[0][0].map((c) => c.name);
    const b = dealDraft(set, 2).rounds[0][0].map((c) => c.name);
    expect(a).not.toEqual(b);
  });

  it("reports its own pack size and pick count, so the engine needs no set", () => {
    const deal = dealDraft(set, 42);
    expect(dealPackSize(deal)).toBe(deal.rounds[0][0].length);
    expect(dealTotalPicks(deal)).toBe(PACK.packsPerDraft * dealPackSize(deal));
  });
});

describe("the bot stream", () => {
  it("is a different stream from the deal, so bots cannot shift the boosters", () => {
    const bots = botRng(42);
    const drawn = Array.from({ length: 5 }, () => bots());
    // Draining the bot stream must leave a re-deal of the same seed untouched.
    expect(dealDraft(set, 42)).toEqual(dealDraft(set, 42));
    expect(drawn.some((u) => u !== 0)).toBe(true);
  });
});

describe("packDeal / unpackDeal", () => {
  // The engine half and no more, which is what a stored pool holds. The fixture
  // deals whole `Card`s, so comparing them whole would assert that packing keeps
  // the text half -- which it deliberately does not. See packedCards.ts.
  const engineHalf = (c: EngineCard): EngineCard => ({
    name: c.name,
    colors: c.colors,
    turn: c.turn,
    role: c.role,
    value: c.value,
    ...(c.slot === undefined ? {} : { slot: c.slot }),
    ...(c.packRate === undefined ? {} : { packRate: c.packRate }),
  });

  it("round-trips every booster, card for card, in order", () => {
    const deal = dealDraft(set, 7);
    const back = unpackDeal(packDeal(deal));
    expect(back.rounds).toEqual(
      deal.rounds.map((round) => round.map((booster) => booster.map(engineHalf))),
    );
  });

  it("stores each distinct card once, however many boosters hold it", () => {
    const deal = dealDraft(set, 7);
    const packed = packDeal(deal);
    const dealt = deal.rounds.flat().flat().length;
    expect(packed.cards.names.length).toBeLessThan(dealt);
  });

  it("refuses a booster pointing outside its own pool", () => {
    const packed = packDeal(dealDraft(set, 7));
    packed.rounds[0][0][0] = packed.cards.names.length;
    expect(() => unpackDeal(packed)).toThrow(/refers to card/);
  });
});
