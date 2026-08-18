import { describe, expect, it } from "vitest";
import {
  type MissCandidate,
  type MissQuestion,
  gradeMiss,
  missGap,
  pickIndexOfMiss,
  rankMisses,
  scoreMissRun,
} from "./misses.js";

const miss = (packNo: number, pickNo: number, gap: number): MissCandidate => ({
  packNo,
  pickNo,
  pickedValue: 0.5,
  bestValue: 0.5 + gap,
});

describe("pickIndexOfMiss", () => {
  // Three packs of four, so a pick number alone is ambiguous and only the pair
  // locates a pick -- which is the whole reason the pair is what is matched.
  const picks = {
    packNos: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
    pickNos: [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4],
  };

  it("finds the position of a pick from its pack and pick number", () => {
    expect(pickIndexOfMiss(picks, { packNo: 2, pickNo: 3 })).toBe(6);
  });

  it("does not confuse the same pick number in a different pack", () => {
    expect(pickIndexOfMiss(picks, { packNo: 1, pickNo: 1 })).toBe(0);
    expect(pickIndexOfMiss(picks, { packNo: 3, pickNo: 1 })).toBe(8);
  });

  // A digest whose arrays do not contain the pair is a miss that cannot be
  // served. Serving it from the nearest pack would deal a stranger's question.
  it("answers undefined rather than guessing", () => {
    expect(pickIndexOfMiss(picks, { packNo: 4, pickNo: 1 })).toBeUndefined();
  });
});

describe("rankMisses", () => {
  it("puts the largest gap first", () => {
    const ranked = rankMisses([miss(1, 1, 0.01), miss(2, 2, 0.09), miss(3, 3, 0.04)], 10);
    expect(ranked.map(missGap)).toEqual([0.09, 0.04, 0.01].map((n) => expect.closeTo(n, 10)));
  });

  it("takes only what was asked for", () => {
    expect(rankMisses([miss(1, 1, 0.01), miss(2, 2, 0.09)], 1)).toHaveLength(1);
  });

  it("leaves the caller's list alone", () => {
    const candidates = [miss(1, 1, 0.01), miss(2, 2, 0.09)];
    rankMisses(candidates, 10);
    expect(candidates[0].packNo).toBe(1);
  });
});

describe("gradeMiss", () => {
  // A pick that took the strongest card in the pack and still missed what the
  // deck wanted -- the shape that makes `tookRawBest` worth carrying.
  const question: MissQuestion = {
    tookName: "Stickytongue Sentinel",
    gradedName: "Mudflat Village",
    rawBestName: "Stickytongue Sentinel",
  };

  it("calls the graded-against card fixed", () => {
    expect(gradeMiss(question, "Mudflat Village")).toMatchObject({
      outcome: "fixed",
      correct: true,
      repeated: false,
    });
  });

  it("calls the same card as last time stood", () => {
    expect(gradeMiss(question, "Stickytongue Sentinel")).toMatchObject({
      outcome: "stood",
      correct: false,
      repeated: true,
    });
  });

  it("calls a third card missed", () => {
    expect(gradeMiss(question, "Bushwhack")).toMatchObject({
      outcome: "missed",
      correct: false,
      repeated: false,
    });
  });

  it("marks a wrong answer that is the strongest card in the pack", () => {
    expect(gradeMiss(question, "Stickytongue Sentinel").tookRawBest).toBe(true);
  });

  // Strict grading is what keeps "fixed" meaning something: under lenient
  // grading, re-taking the raw best would be scored correct in a drill built
  // entirely out of picks that were graded against a different card.
  it("does not accept the raw best in place of the graded-against card", () => {
    expect(gradeMiss(question, question.rawBestName).correct).toBe(false);
  });

  it("does not mark the answer itself as the raw best", () => {
    const agreed: MissQuestion = { ...question, rawBestName: "Mudflat Village" };
    expect(gradeMiss(agreed, "Mudflat Village").tookRawBest).toBe(false);
  });
});

describe("scoreMissRun", () => {
  const question: MissQuestion = { tookName: "A", gradedName: "B", rawBestName: "A" };

  it("counts each outcome", () => {
    const results = [
      gradeMiss(question, "B"),
      gradeMiss(question, "B"),
      gradeMiss(question, "A"),
      gradeMiss(question, "C"),
    ];
    expect(scoreMissRun(results)).toEqual({ answered: 4, fixed: 2, stood: 1, missed: 1 });
  });

  it("is empty before anything is answered", () => {
    expect(scoreMissRun([])).toEqual({ answered: 0, fixed: 0, stood: 0, missed: 0 });
  });
});
