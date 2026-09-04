import { describe, expect, it } from "vitest";
import { DECK_SPEED } from "../config.js";
import {
  type DeckSpeedCard,
  dealDeckSpeedRun,
  deckSpeedQuestions,
  gradeDeckSpeedGuess,
  scoreDeckSpeedRun,
} from "./deckSpeed.js";

// Real fdn numbers off the built artifact, sampled EVENLY BY RANK rather than
// hand-picked, because the gates are fractions of the set's own spread and a
// fixture of tails would exercise a spread no set has. This one's sd is 0.135
// against fdn's real 0.168 -- within a fifth, where an all-extremes fixture ran
// 2.5x and quietly admitted cards the shipped gate refuses.
//
// It also carries Healer's Hawk, which is the card the review found the drill
// wrong on: -0.085 turns over 28,755 games, where a z test alone called it a
// card whose decks end early.
const FDN: DeckSpeedCard[] = [
  { name: "Balmor, Battlemage Captain", deckSpeed: -0.3263, deckSpeedSe: 0.0321, deckSpeedN: 7188 },
  { name: "Ajani, Caller of the Pride", deckSpeed: -0.2302, deckSpeedSe: 0.0541, deckSpeedN: 3058 },
  { name: "Diregraf Ghoul", deckSpeed: -0.2, deckSpeedSe: 0.0359, deckSpeedN: 7127 },
  { name: "Wardens of the Cycle", deckSpeed: -0.1635, deckSpeedSe: 0.0383, deckSpeedN: 5814 },
  { name: "Dwynen's Elite", deckSpeed: -0.1476, deckSpeedSe: 0.0258, deckSpeedN: 12130 },
  { name: "Giada, Font of Hope", deckSpeed: -0.1266, deckSpeedSe: 0.0395, deckSpeedN: 6232 },
  { name: "Twinflame Tyrant", deckSpeed: -0.105, deckSpeedSe: 0.0473, deckSpeedN: 3358 },
  { name: "Healer's Hawk", deckSpeed: -0.0854, deckSpeedSe: 0.0184, deckSpeedN: 28755 },
  { name: "Authority of the Consuls", deckSpeed: -0.0682, deckSpeedSe: 0.0847, deckSpeedN: 1408 },
  { name: "Resolute Reinforcements", deckSpeed: -0.0422, deckSpeedSe: 0.0289, deckSpeedN: 11189 },
  { name: "Dwynen, Gilt-Leaf Daen", deckSpeed: -0.0259, deckSpeedSe: 0.0376, deckSpeedN: 6019 },
  { name: "Mocking Sprite", deckSpeed: 0.0012, deckSpeedSe: 0.0315, deckSpeedN: 8747 },
  { name: "Grappling Kraken", deckSpeed: 0.0129, deckSpeedSe: 0.0415, deckSpeedN: 5241 },
  { name: "Affectionate Indrik", deckSpeed: 0.0255, deckSpeedSe: 0.0271, deckSpeedN: 11080 },
  { name: "Icewind Elemental", deckSpeed: 0.0411, deckSpeedSe: 0.0218, deckSpeedN: 19071 },
  { name: "Cat Collector", deckSpeed: 0.0516, deckSpeedSe: 0.0253, deckSpeedN: 15512 },
  { name: "Vampire Nighthawk", deckSpeed: 0.0678, deckSpeedSe: 0.0251, deckSpeedN: 15298 },
  { name: "Reassembling Skeleton", deckSpeed: 0.0933, deckSpeedSe: 0.0298, deckSpeedN: 10640 },
  { name: "Paradise Druid", deckSpeed: 0.1133, deckSpeedSe: 0.1291, deckSpeedN: 507 },
  { name: "Secluded Courtyard", deckSpeed: 0.1341, deckSpeedSe: 0.1198, deckSpeedN: 577 },
  { name: "Banishing Light", deckSpeed: 0.1673, deckSpeedSe: 0.0178, deckSpeedN: 31013 },
  { name: "Aegis Turtle", deckSpeed: 0.2282, deckSpeedSe: 0.0486, deckSpeedN: 4122 },
];

const byName = (qs: readonly { name: string }[], name: string) =>
  qs.find((q) => q.name === name);

describe("deckSpeedQuestions", () => {
  it("calls the ends by their sign and the flat cards middle", () => {
    const qs = deckSpeedQuestions(FDN);
    expect(byName(qs, "Aegis Turtle")?.answer).toBe("slow");
    expect(byName(qs, "Balmor, Battlemage Captain")?.answer).toBe("fast");
    expect(byName(qs, "Mocking Sprite")?.answer).toBe("middle");
  });

  // THE DEFECT THIS DRILL SHIPPED WITH INTO REVIEW. On a z test alone the answer
  // tracked how much a card gets played: 28,755 games make four hundredths of a
  // turn clear two error bars. Both cards below are far from flat in error bars
  // and near it in turns, and both have to come back middle.
  it("does not call a card fast just because it has a lot of games", () => {
    const qs = deckSpeedQuestions([
      ...FDN,
      // 5.4 error bars out, and four hundredths of a turn.
      { name: "Much Played", deckSpeed: -0.042, deckSpeedSe: 0.0078, deckSpeedN: 60000 },
      { name: "Much Played Slow", deckSpeed: 0.043, deckSpeedSe: 0.008, deckSpeedN: 60000 },
    ]);
    expect(byName(qs, "Much Played")?.answer).toBe("middle");
    expect(byName(qs, "Much Played Slow")?.answer).toBe("middle");
  });

  it("keeps the buckets from overlapping on effect size", () => {
    const qs = deckSpeedQuestions(FDN);
    const middles = qs.filter((q) => q.answer === "middle").map((q) => Math.abs(q.resid));
    const ends = qs.filter((q) => q.answer !== "middle").map((q) => Math.abs(q.resid));
    // The whole point of the floor: no card called neither may be further from
    // flat than a card called fast or slow. Before it, middle's largest effect
    // exceeded the ends' median.
    expect(Math.max(...middles)).toBeLessThan(Math.min(...ends));
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

  // Evolving Wilds is the sharpest `middle` card in real fdn, so without this it
  // is the first question a player ever sees -- and "what kind of deck plays
  // Evolving Wilds" teaches nothing. A fixing land goes in every deck by
  // definition, which is why it measures flat.
  it("drops lands, however sharply they are measured", () => {
    const qs = deckSpeedQuestions([
      ...FDN,
      { name: "Evolving Wilds", deckSpeed: 0.062, deckSpeedSe: 0.014, deckSpeedN: 40780, role: "land" },
    ]);
    expect(byName(qs, "Evolving Wilds")).toBeUndefined();
  });

  it("keeps a card whose role is unknown, because absent is not not-a-land", () => {
    const qs = deckSpeedQuestions([
      ...FDN,
      { name: "No Role Recorded", deckSpeed: 0.3, deckSpeedSe: 0.02, deckSpeedN: 9000 },
    ]);
    expect(byName(qs, "No Role Recorded")?.answer).toBe("slow");
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

  // THE TEST THE PAGER SHIPPED WITHOUT, and the defect it would have caught.
  // The first version applied `skip` to each bucket pile while `deal` advanced
  // it across all of them, so the piles ran dry with two thirds of the bank
  // never asked -- and the assertion above passed over it, because a later page
  // did differ from the first. Walking to exhaustion is what catches it.
  it("serves every card in the bank exactly once, walking to the end", () => {
    const bank = (answer: "fast" | "middle" | "slow", n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({
        name: `${prefix}${i}`,
        resid: 0,
        se: 1,
        n: 9999,
        answer,
        sigmas: 0,
      }));
    // fdn's real shape: 70 fast, 103 middle, 73 slow.
    const qs = [...bank("fast", 70, "F"), ...bank("slow", 73, "S"), ...bank("middle", 103, "M")];

    const seen: string[] = [];
    for (let skip = 0; ; ) {
      const run = dealDeckSpeedRun(qs, 8, skip);
      if (run.length === 0) break;
      seen.push(...run.map((q) => q.name));
      skip += run.length;
      if (skip > qs.length * 2) throw new Error("pager did not terminate");
    }

    expect(seen).toHaveLength(qs.length);
    expect(new Set(seen).size).toBe(qs.length);
  });

  it("keeps the set's own proportions rather than an even third", () => {
    const bank = (answer: "fast" | "middle" | "slow", n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({
        name: `${prefix}${i}`,
        resid: 0,
        se: 1,
        n: 9999,
        answer,
        sigmas: 0,
      }));
    const qs = [...bank("fast", 10, "F"), ...bank("middle", 80, "M"), ...bank("slow", 10, "S")];
    const run = dealDeckSpeedRun(qs, 30);
    // A mostly-middle set serves a mostly-middle run: the fact that most cards
    // pull neither way is the lesson, not something to balance away.
    expect(run.filter((q) => q.answer === "middle").length).toBeGreaterThan(15);
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
