import { describe, expect, it } from "vitest";
import type { Card } from "../model/card.js";
import type { StoredPick } from "../model/review.js";
import { buildReviewContext } from "./reviewPrompt.js";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    colors: [],
    colorIdentity: [],
    manaCost: "",
    cmc: 2,
    typeLine: "Creature",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.55,
    gihGames: 5000,
    alsa: 6,
    ...over,
  };
}

describe("buildReviewContext", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58 });
  const best = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });

  const pick: StoredPick = {
    pickIndex: 4,
    packNo: 1,
    pickNo: 5,
    pack: [picked, best],
    picked,
    bestName: best.name,
    score: 72,
    isBest: false,
    onColor: true,
  };

  it("says nothing about a sideboard when nothing was set aside", () => {
    expect(buildReviewContext(pick, [card("Storm Fox", { colors: ["U"] })])).not.toContain(
      "Sideboard",
    );
  });

  describe("with cards set aside by this pick", () => {
    // Two blue cards drafted and then benched: the pool reads as committed to
    // blue only if you count cards the player had already given up on.
    const benched = [card("Storm Fox", { colors: ["U"] }), card("Tide Herald", { colors: ["U"] })];
    const ctx = buildReviewContext(pick, [], benched);

    it("lists them, and says they were not being built with", () => {
      expect(ctx).toContain("Sideboard by this point (2 cards)");
      expect(ctx).toContain("Storm Fox");
      expect(ctx).toContain("NOT");
    });

    it("leaves them out of the committed colors", () => {
      expect(ctx).toContain("Committed colors: none yet");
    });

    it("leaves them out of the pool it counts, so the two lists cannot double-count", () => {
      expect(ctx).toContain("Pool before this pick (0 cards)");
    });
  });
});
