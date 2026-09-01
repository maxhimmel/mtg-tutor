import { describe, expect, it } from "vitest";
import {
  type MissCandidate,
  type MissQuestion,
  cardsLeftAtMiss,
  gradeMiss,
  missGap,
  missProgress,
  missTier,
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

describe("cardsLeftAtMiss", () => {
  const picks = {
    packNos: [1, 1, 1, 1, 2, 2, 2, 2],
    pickNos: [1, 2, 3, 4, 1, 2, 3, 4],
  };

  it("counts the pack down from its own size", () => {
    expect(cardsLeftAtMiss(picks, { packNo: 1, pickNo: 1 })).toBe(4);
    expect(cardsLeftAtMiss(picks, { packNo: 1, pickNo: 3 })).toBe(2);
    expect(cardsLeftAtMiss(picks, { packNo: 2, pickNo: 4 })).toBe(1);
  });

  // The size is taken from the pack the miss is in, not from the draft, because
  // nothing promises every pack of every format holds the same number.
  it("sizes each pack on its own picks", () => {
    const uneven = { packNos: [1, 1, 2, 2, 2], pickNos: [1, 2, 1, 2, 3] };
    expect(cardsLeftAtMiss(uneven, { packNo: 1, pickNo: 1 })).toBe(2);
    expect(cardsLeftAtMiss(uneven, { packNo: 2, pickNo: 1 })).toBe(3);
  });
});

const asked = (m: MissCandidate, at: string, fixed: boolean): MissCandidate => ({
  ...m,
  asked: { at, fixed },
});

describe("missTier", () => {
  it("calls a candidate with no history unasked", () => {
    expect(missTier(miss(1, 1, 0.05))).toBe("unasked");
  });

  it("separates a fixed one from one still wrong", () => {
    expect(missTier(asked(miss(1, 1, 0.05), "2026-08-01", true))).toBe("fixed");
    expect(missTier(asked(miss(1, 1, 0.05), "2026-08-01", false))).toBe("unfixed");
  });
});

describe("rankMisses", () => {
  it("puts the largest gap first", () => {
    const ranked = rankMisses([miss(1, 1, 0.01), miss(2, 2, 0.09), miss(3, 3, 0.04)], 10);
    expect(ranked.map(missGap)).toEqual([0.09, 0.04, 0.01].map((n) => expect.closeTo(n, 10)));
  });

  // The tier beats both other keys, which is the whole change: the biggest miss
  // in the history stops being dealt first once it has been taken back.
  //
  // Built so that EVERY other key disagrees with the answer -- the fixed one has
  // the widest gap and the oldest date, the unasked one the narrowest gap -- so
  // this can only come out right on the tier. The first draft of it could not
  // fail: flattening the tiers left the same order standing.
  it("deals what has never been asked before what has", () => {
    const fresh = miss(1, 1, 0.01);
    const ranked = rankMisses(
      [
        asked(miss(2, 2, 0.05), "2026-08-01", false),
        asked(miss(3, 3, 0.09), "2026-07-01", true),
        fresh,
      ],
      10,
    );
    expect(ranked.map(missTier)).toEqual(["unasked", "unfixed", "fixed"]);
    expect(ranked[0]).toBe(fresh);
  });

  // Spacing, without a rest interval to pick out of the air.
  it("brings back the least recently asked first", () => {
    const ranked = rankMisses(
      [
        asked(miss(1, 1, 0.09), "2026-08-20", false),
        asked(miss(2, 2, 0.01), "2026-08-01", false),
        asked(miss(3, 3, 0.05), "2026-08-10", false),
      ],
      10,
    );
    expect(ranked.map((m) => m.asked?.at)).toEqual(["2026-08-01", "2026-08-10", "2026-08-20"]);
  });

  it("falls back to the gap inside one tier on one date", () => {
    const ranked = rankMisses(
      [asked(miss(1, 1, 0.01), "2026-08-01", false), asked(miss(2, 2, 0.09), "2026-08-01", false)],
      10,
    );
    expect(ranked.map(missGap)).toEqual([0.09, 0.01].map((n) => expect.closeTo(n, 10)));
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

describe("missProgress", () => {
  const answer = (key: string, at: string, fixed: boolean) => ({ key, at, fixed });

  it("counts nothing out of nothing", () => {
    expect(missProgress([])).toMatchObject({ asked: 0, askedAgain: 0, answers: 0 });
  });

  it("counts questions, not attempts", () => {
    const progress = missProgress([
      answer("a", "2026-08-01", false),
      answer("a", "2026-08-10", true),
      answer("b", "2026-08-02", false),
    ]);
    expect(progress.asked).toBe(2);
    expect(progress.answers).toBe(3);
  });

  it("reads the latest answer for fixed, not the first", () => {
    expect(
      missProgress([answer("a", "2026-08-01", true), answer("a", "2026-08-10", false)]).fixed,
    ).toBe(0);
  });

  it("splits a repeat four ways, exhaustively", () => {
    const progress = missProgress([
      // missed, then took it back
      answer("a", "2026-08-01", false),
      answer("a", "2026-08-10", true),
      // took it back, and held on
      answer("b", "2026-08-01", true),
      answer("b", "2026-08-10", true),
      // took it back, then let it go
      answer("c", "2026-08-01", true),
      answer("c", "2026-08-10", false),
      // missed twice
      answer("d", "2026-08-01", false),
      answer("d", "2026-08-10", false),
      // asked once, and so in none of the four
      answer("e", "2026-08-01", false),
    ]);
    expect(progress).toMatchObject({
      asked: 5,
      askedAgain: 4,
      tookBack: 1,
      heldOn: 1,
      slipped: 1,
      stillWrong: 1,
    });
    expect(progress.tookBack + progress.heldOn + progress.slipped + progress.stillWrong).toBe(
      progress.askedAgain,
    );
  });

  // The rows arrive in an index's insertion order, which is nearly chronological
  // and is not. Fed backwards, the fold must still know which end is which.
  it("orders by the date and not by arrival", () => {
    expect(
      missProgress([answer("a", "2026-08-10", true), answer("a", "2026-08-01", false)]),
    ).toMatchObject({ tookBack: 1, slipped: 0, fixed: 1 });
  });

  // A question answered many times is one story, not one per transition.
  it("reads first against latest rather than every step", () => {
    expect(
      missProgress([
        answer("a", "2026-08-01", false),
        answer("a", "2026-08-05", true),
        answer("a", "2026-08-09", false),
        answer("a", "2026-08-14", true),
      ]),
    ).toMatchObject({ askedAgain: 1, tookBack: 1, heldOn: 0, slipped: 0 });
  });
});
