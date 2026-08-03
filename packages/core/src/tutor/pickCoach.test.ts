import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";
import type { PickScore } from "../scoring/score.js";
import { buildPickContext } from "./pickCoach.js";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    value: 0.55,
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

describe("buildPickContext", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58, typeLine: "Instant" });
  const best = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });
  const poolMate = card("Storm Fox", { colors: ["U"] });

  const score: PickScore<Card> = {
    score: 72,
    grade: "B",
    picked,
    pickedValue: 0.58,
    pickedContextValue: 0.58,
    rawBest: best,
    rawBestValue: 0.62,
    contextBest: best,
    contextBestValue: 0.62,
    terms: [],
    isBest: false,
    onColor: true,
    rankInPack: 2,
  };

  const rec: RecordedPick<Card> = {
    packNo: 1,
    pickNo: 3,
    pack: [picked, best],
    picked,
    score,
  };

  // The pool BEFORE the pick; buildPickContext adds the picked card back for display.
  const ctx = buildPickContext(rec, [poolMate]);

  it("names the picked card and the pick position", () => {
    expect(ctx).toContain("Lightning Strike");
    expect(ctx).toContain("Pack 1, Pick 3");
  });

  // Pack and pick number alone left the coach unable to tell an early pick from
  // a late one, so it advised staying open at pick 40.
  it("places the pick in the whole draft", () => {
    expect(ctx).toContain("pick 3 of 12 in the draft");
  });

  it("states the colors the pool has committed to", () => {
    expect(ctx).toContain("Committed colors: none yet");
  });

  it("includes the running pool, with the pick in it", () => {
    expect(ctx).toContain("Storm Fox");
    expect(ctx).toContain("Your pool so far (2 cards)");
  });

  it("includes the numeric data verdict", () => {
    expect(ctx).toContain("72/100");
    expect(ctx).toContain("Big Bomb"); // best-available card by the numbers
  });

  // The cards the player DIDN'T take used to render as bare names, so every
  // curve or size claim the coach made about one of them was invention.
  it("gives the passed cards their cost and type, not just a name", () => {
    expect(ctx).toContain("Big Bomb — 2 mana, Red, Creature");
  });

  it("gives the passed cards their stats, not just a win rate", () => {
    expect(ctx).toContain("ALSA 6.0");
  });

  it("says nothing about a sideboard when nothing has been benched", () => {
    expect(ctx).not.toContain("Sideboard");
  });

  describe("with cards benched", () => {
    // Two blue cards in the pool, both set aside: the pool is committed to blue
    // only if you count cards the player has already given up on.
    const benched = [card("Storm Fox", { colors: ["U"] }), card("Tide Herald", { colors: ["U"] })];
    const withBench = buildPickContext(rec, [], benched);

    it("lists what was set aside, and says it is not being built with", () => {
      expect(withBench).toContain("Sideboard (2 cards)");
      expect(withBench).toContain("Storm Fox");
      expect(withBench).toContain("NOT");
    });

    it("leaves the benched cards out of the committed colors", () => {
      expect(withBench).toContain("Committed colors: none yet");
    });

    it("leaves them out of the pool it counts, so the two lists cannot double-count", () => {
      expect(withBench).toContain("Your pool so far (1 cards)");
    });
  });

  describe("with a pivot", () => {
    // The case a filtered pool cannot express: the deck reads RW either way, but
    // only the pivot line says blue was given up and when.
    const ctxWithPivot = buildPickContext(rec, [], [], [
      {
        atPick: 19,
        colors: ["U"],
        cards: [
          { name: "Storm Fox", colors: ["U"] },
          { name: "Tide Herald", colors: ["U"] },
        ],
      },
    ]);

    it("puts the abandoned color and the moment into the prompt", () => {
      expect(ctxWithPivot).toContain("at pick 20");
      expect(ctxWithPivot).toContain("left Blue behind");
    });

    it("says nothing when no color was left behind", () => {
      expect(ctx).not.toContain("Pivot:");
    });
  });
});

describe("buildPickContext showing the verdict's working", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58 });
  const other = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });
  const base = (over: Partial<PickScore<Card>>): RecordedPick<Card> => ({
    packNo: 2,
    pickNo: 5,
    pack: [picked, other],
    picked,
    score: {
      score: 84,
      grade: "B+",
      picked,
      pickedValue: 0.58,
      pickedContextValue: 0.58,
      rawBest: other,
      rawBestValue: 0.62,
      contextBest: picked,
      contextBestValue: 0.6,
      terms: [],
      isBest: true,
      onColor: true,
      rankInPack: 2,
      ...over,
    },
  });

  it("names both answers when they differ, so the gap can be taught", () => {
    const out = buildPickContext(base({}), []);
    expect(out).toContain("Strongest card in the pack: Big Bomb");
    expect(out).toContain("Best for THIS deck: Lightning Strike");
  });

  it("says so plainly when they agree, rather than leaving it to be inferred", () => {
    const out = buildPickContext(base({ contextBest: other, rawBest: other }), []);
    expect(out).toContain("also the best one for this deck: Big Bomb");
  });

  it("lists the reasons the pick was worth what it was", () => {
    const out = buildPickContext(
      base({ terms: [{ label: "archetype", delta: 0.023 }, { label: "splash", delta: -0.008 }] }),
      [],
    );
    expect(out).toContain("archetype +2.3pp");
    expect(out).toContain("splash -0.8pp");
  });

  it("says nothing about reasons when none moved the pick", () => {
    expect(buildPickContext(base({}), [])).not.toContain("is worth what it is here");
  });
});
