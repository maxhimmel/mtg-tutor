import { describe, expect, it } from "vitest";
import { DECK_SPEED } from "../config.js";
import {
  type DeckSpeedCard,
  dealDeckSpeedRun,
  deckSpeedQuestions,
  gradeDeckSpeedGuess,
  scoreDeckSpeedRun,
} from "./deckSpeed.js";

// Real fdn numbers off the built artifact, not invented ones. The extremes and
// the middles both come from cards a person can check: Day of Judgment really
// does sit at +0.698 over 5,471 games, and Prideful Parent really is flat at
// +0.002 over 24,795.
const FDN: DeckSpeedCard[] = [
  { name: "Boltwave", deckSpeed: -0.516, deckSpeedSe: 0.092, deckSpeedN: 677 },
  { name: "Adventuring Gear", deckSpeed: -0.481, deckSpeedSe: 0.099, deckSpeedN: 704 },
  { name: "Leyline Axe", deckSpeed: -0.44, deckSpeedSe: 0.031, deckSpeedN: 8050 },
  { name: "Frenzied Goblin", deckSpeed: -0.325, deckSpeedSe: 0.042, deckSpeedN: 3892 },
  { name: "Mocking Sprite", deckSpeed: -0.001, deckSpeedSe: 0.032, deckSpeedN: 8747 },
  { name: "Prideful Parent", deckSpeed: 0.002, deckSpeedSe: 0.02, deckSpeedN: 24795 },
  { name: "Dazzling Angel", deckSpeed: 0.003, deckSpeedSe: 0.018, deckSpeedN: 29378 },
  { name: "Slagstorm", deckSpeed: 0.385, deckSpeedSe: 0.05, deckSpeedN: 3582 },
  { name: "Blasphemous Edict", deckSpeed: 0.588, deckSpeedSe: 0.037, deckSpeedN: 8108 },
  { name: "Day of Judgment", deckSpeed: 0.698, deckSpeedSe: 0.046, deckSpeedN: 5471 },
];

const byName = (qs: readonly { name: string }[], name: string) =>
  qs.find((q) => q.name === name);

describe("deckSpeedQuestions", () => {
  it("calls the ends by their sign and the flat cards middle", () => {
    const qs = deckSpeedQuestions(FDN);
    expect(byName(qs, "Day of Judgment")?.answer).toBe("slow");
    expect(byName(qs, "Leyline Axe")?.answer).toBe("fast");
    expect(byName(qs, "Prideful Parent")?.answer).toBe("middle");
  });

  it("gives the middle answer to a card measured flat, not to one barely measured", () => {
    // Same residual, wildly different precision. The flat-and-sharp card is a
    // finding; the flat-and-vague one is a shortage of games and is not asked.
    const qs = deckSpeedQuestions([
      ...FDN,
      { name: "Sharp And Flat", deckSpeed: 0.001, deckSpeedSe: 0.02, deckSpeedN: 20000 },
      { name: "Vague And Flat", deckSpeed: 0.001, deckSpeedSe: 0.4, deckSpeedN: 420 },
    ]);
    expect(byName(qs, "Sharp And Flat")?.answer).toBe("middle");
    expect(byName(qs, "Vague And Flat")).toBeUndefined();
  });

  it("refuses a card under the game floor even when its estimate looks sharp", () => {
    const qs = deckSpeedQuestions([
      ...FDN,
      { name: "Too Few Games", deckSpeed: -0.5, deckSpeedSe: 0.01, deckSpeedN: 12 },
    ]);
    expect(byName(qs, "Too Few Games")).toBeUndefined();
  });

  it("drops a card with no residual rather than calling it middle", () => {
    const qs = deckSpeedQuestions([...FDN, { name: "Unmeasured" }]);
    expect(byName(qs, "Unmeasured")).toBeUndefined();
  });

  it("yields nothing for a set whose game data carried no turns", () => {
    expect(deckSpeedQuestions([{ name: "A" }, { name: "B" }])).toEqual([]);
  });

  it("puts the clearest ends first and the sharpest middles after them", () => {
    const qs = deckSpeedQuestions(FDN);
    const ends = qs.filter((q) => q.answer !== "middle");
    const middles = qs.filter((q) => q.answer === "middle");
    expect(qs.slice(0, ends.length).every((q) => q.answer !== "middle")).toBe(true);
    for (let i = 1; i < ends.length; i++) {
      expect(Math.abs(ends[i].sigmas)).toBeLessThanOrEqual(Math.abs(ends[i - 1].sigmas));
    }
    for (let i = 1; i < middles.length; i++) {
      expect(middles[i].se).toBeGreaterThanOrEqual(middles[i - 1].se);
    }
  });

  it("scales the precision gate with the set's own spread", () => {
    // Every residual and error bar halved: the same cards are askable, because
    // the gate is a fraction of the spread rather than a fixed width in turns.
    const halved = FDN.map((c) => ({
      ...c,
      deckSpeed: c.deckSpeed! / 2,
      deckSpeedSe: c.deckSpeedSe! / 2,
    }));
    expect(deckSpeedQuestions(halved).map((q) => q.name).sort()).toEqual(
      deckSpeedQuestions(FDN).map((q) => q.name).sort(),
    );
  });
});

describe("dealDeckSpeedRun", () => {
  it("serves every answer the set has when the run is long enough", () => {
    const run = dealDeckSpeedRun(deckSpeedQuestions(FDN), 6);
    expect(new Set(run.map((q) => q.answer))).toEqual(new Set(["fast", "middle", "slow"]));
  });

  it("never repeats a card inside one run", () => {
    const run = dealDeckSpeedRun(deckSpeedQuestions(FDN), 10);
    expect(new Set(run.map((q) => q.name)).size).toBe(run.length);
  });

  it("stops at what the set has rather than padding", () => {
    expect(dealDeckSpeedRun(deckSpeedQuestions(FDN), 500).length).toBeLessThanOrEqual(
      deckSpeedQuestions(FDN).length,
    );
    expect(dealDeckSpeedRun([], 5)).toEqual([]);
    expect(dealDeckSpeedRun(deckSpeedQuestions(FDN), 0)).toEqual([]);
  });

  it("skips forward without re-serving the front of the list", () => {
    const qs = deckSpeedQuestions(FDN);
    const first = dealDeckSpeedRun(qs, 3);
    const later = dealDeckSpeedRun(qs, 3, 2);
    expect(later.map((q) => q.name)).not.toEqual(first.map((q) => q.name));
  });
});

describe("gradeDeckSpeedGuess", () => {
  it("reads a right answer", () => {
    const r = gradeDeckSpeedGuess({ answer: "slow" }, "slow");
    expect(r).toEqual({ outcome: "read", correct: true, mistake: null });
  });

  it("names reading an opinion into a flat card `saw-difference`", () => {
    expect(gradeDeckSpeedGuess({ answer: "middle" }, "fast").mistake).toBe("saw-difference");
    expect(gradeDeckSpeedGuess({ answer: "middle" }, "slow").mistake).toBe("saw-difference");
  });

  it("names missing a real end `saw-none`", () => {
    expect(gradeDeckSpeedGuess({ answer: "fast" }, "middle").mistake).toBe("saw-none");
  });

  it("names calling a wrath fast `backwards`", () => {
    expect(gradeDeckSpeedGuess({ answer: "slow" }, "fast").mistake).toBe("backwards");
  });
});

describe("scoreDeckSpeedRun", () => {
  it("counts reads against misreads", () => {
    const results = [
      gradeDeckSpeedGuess({ answer: "slow" }, "slow"),
      gradeDeckSpeedGuess({ answer: "fast" }, "middle"),
      gradeDeckSpeedGuess({ answer: "middle" }, "middle"),
    ];
    expect(scoreDeckSpeedRun(results)).toEqual({ answered: 3, read: 2, misread: 1 });
  });
});

describe("the settings are what the derivation says", () => {
  it("keeps the two-error-bar width the rest of the codebase uses", () => {
    expect(DECK_SPEED.width).toBe(2);
  });

  it("keeps a middle card's interval inside one set-spread of zero", () => {
    expect(DECK_SPEED.width * DECK_SPEED.precision).toBe(1);
  });
});
