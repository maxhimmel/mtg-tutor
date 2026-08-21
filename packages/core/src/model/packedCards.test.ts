import { describe, expect, it } from "vitest";
import type { EngineCard } from "./card.js";
import { packCards, unpackCards, type PackedCards } from "./packedCards.js";

const card = (over: Partial<EngineCard> = {}): EngineCard => ({
  name: "Llanowar Elves",
  colors: ["G"],
  turn: 1,
  role: "creature",
  value: 62,
  ...over,
});

describe("packCards / unpackCards", () => {
  it("round-trips a pool unchanged", () => {
    const cards = [
      card({ name: "Shock", colors: ["R"], role: "removal", slot: "common" }),
      card({ name: "Gold Dragon", colors: ["W", "U"], turn: 6, slot: "mythic", packRate: 0.01 }),
      card({ name: "Plains", colors: [], role: "other", value: 0 }),
    ];
    expect(unpackCards(packCards(cards))).toEqual(cards);
  });

  it("preserves order, which decides what every pack deals", () => {
    const cards = ["a", "b", "c", "d"].map((name, i) => card({ name, value: i }));
    expect(unpackCards(packCards(cards)).map((c) => c.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("omits an optional column no card uses, rather than storing holes", () => {
    const packed = packCards([card(), card({ name: "Shock" })]);
    expect(packed.slots).toBeUndefined();
    expect(packed.packRates).toBeUndefined();
    expect(packed.tableValues).toBeUndefined();
  });

  // The column a pod picks by. A pool stored before it existed has none, and a
  // deal packed from that pool has to come back with the field ABSENT rather
  // than zero -- `policyFeatures` reads `tableValue ?? value`, so a zero here
  // would tell every bot the table wants nothing, uniformly, and the pod would
  // deal from the fallback while looking like it was working.
  it("round-trips the pick-order column, absent where a card has none", () => {
    const packed = packCards([
      card({ name: "Cyclonic Rift", value: 0.5702, tableValue: 0.6753 }),
      card({ name: "Plains", value: 0 }),
    ]);
    expect(packed.tableValues).toEqual([0.6753, null]);

    const [rift, plains] = unpackCards(packed);
    expect(rift.tableValue).toBe(0.6753);
    expect(plains).not.toHaveProperty("tableValue");
  });

  it("keeps an optional column that some cards use, and leaves the others absent", () => {
    const packed = packCards([card({ slot: "common" }), card({ name: "Shock" })]);
    expect(packed.slots).toEqual(["common", null]);

    const [withSlot, without] = unpackCards(packed);
    expect(withSlot.slot).toBe("common");
    expect(without).not.toHaveProperty("slot");
  });

  it("throws on a short column instead of dealing a card with no curve", () => {
    const packed = packCards([card(), card({ name: "Shock" })]);
    const broken: PackedCards = { ...packed, turns: [1] };
    expect(() => unpackCards(broken)).toThrow(/2 names but 1 turns/);
  });

  it("round-trips an empty pool", () => {
    expect(unpackCards(packCards([]))).toEqual([]);
  });

  it("is smaller than the array of objects it replaces", () => {
    const cards = Array.from({ length: 285 }, (_, i) =>
      card({ name: `Card Number ${i}`, slot: "common" }),
    );
    const objects = JSON.stringify(cards).length;
    const packed = JSON.stringify(packCards(cards)).length;
    expect(packed).toBeLessThan(objects * 0.7);
  });
});
