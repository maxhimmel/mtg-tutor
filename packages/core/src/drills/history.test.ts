import { describe, expect, it } from "vitest";
import {
  type DrillAnswerRow,
  SIGMA_BANDS,
  answerRead,
  sharpnessBand,
  dueForRepeat,
  historyByQuestion,
  readProgress,
} from "./history.js";

const row = (
  key: string,
  at: string,
  answered: string,
  correct: string,
  sigmas = 0.5,
): DrillAnswerRow => ({ key, at, answered, correct, sigmas });

/** Read right, at whatever sharpness. */
const read = (key: string, at: string, sigmas = 0.5) => row(key, at, "wu", "wu", sigmas);
/** Misread. */
const misread = (key: string, at: string, sigmas = 0.5) => row(key, at, "bg", "wu", sigmas);

describe("answerRead", () => {
  it("grades by the answer the question was asked with", () => {
    expect(answerRead({ answered: "same", correct: "same" })).toBe(true);
    expect(answerRead({ answered: "same", correct: "wu" })).toBe(false);
  });
});

describe("historyByQuestion", () => {
  it("orders by the date and not by arrival", () => {
    const history = historyByQuestion([
      misread("a", "2026-09-05T10:00:00Z"),
      read("a", "2026-09-01T10:00:00Z"),
    ]);
    expect(history.get("a")?.first.at).toBe("2026-09-01T10:00:00Z");
    expect(history.get("a")?.latest.at).toBe("2026-09-05T10:00:00Z");
    expect(history.get("a")?.attempts).toBe(2);
  });
});

describe("dueForRepeat", () => {
  const now = "2026-09-07T12:00:00Z";

  it("offers nothing out of nothing", () => {
    expect(dueForRepeat(historyByQuestion([]), now)).toEqual([]);
  });

  it("leaves a question you read alone", () => {
    const history = historyByQuestion([read("a", "2026-09-01T10:00:00Z")]);
    expect(dueForRepeat(history, now)).toEqual([]);
  });

  // The floor. Roediger & Karpicke measured the reversal at an immediate check,
  // so a card re-asked in the sitting that just revealed its answer is testing
  // memory of the reveal.
  it("will not put back a card misread today", () => {
    const history = historyByQuestion([misread("a", "2026-09-07T09:00:00Z")]);
    expect(dueForRepeat(history, now)).toEqual([]);
  });

  it("puts back a card misread on an earlier day", () => {
    const history = historyByQuestion([misread("a", "2026-09-06T23:59:00Z")]);
    expect(dueForRepeat(history, now)).toEqual(["a"]);
  });

  // The LATEST answer decides, so a card taken back stops being due even though
  // its first answer was wrong.
  it("reads the latest answer and not the first", () => {
    const history = historyByQuestion([
      misread("a", "2026-09-01T10:00:00Z"),
      read("a", "2026-09-03T10:00:00Z"),
    ]);
    expect(dueForRepeat(history, now)).toEqual([]);
  });

  it("offers the least recently asked first", () => {
    const history = historyByQuestion([
      misread("recent", "2026-09-06T10:00:00Z"),
      misread("old", "2026-09-01T10:00:00Z"),
      misread("middling", "2026-09-04T10:00:00Z"),
    ]);
    expect(dueForRepeat(history, now)).toEqual(["old", "middling", "recent"]);
  });
});

describe("sharpnessBand", () => {
  it("puts a question in the band its sharpness falls in", () => {
    expect(sharpnessBand(0)).toBe(0);
    expect(sharpnessBand(0.9)).toBe(0);
    expect(sharpnessBand(1)).toBe(1);
    expect(sharpnessBand(2.5)).toBe(2);
    expect(sharpnessBand(3)).toBe(3);
    expect(sharpnessBand(14)).toBe(3);
  });

  // The deck-speed drill signs its sigmas: a card three error bars BELOW the
  // format's mean length is exactly as sharp a question as one three above.
  it("bands on the absolute value, so a fast card is not called easy", () => {
    expect(sharpnessBand(-3.4)).toBe(sharpnessBand(3.4));
    expect(sharpnessBand(-2.2)).toBe(2);
  });
});

describe("readProgress", () => {
  it("counts nothing out of nothing", () => {
    const progress = readProgress([]);
    expect(progress).toMatchObject({ asked: 0, answers: 0, askedAgain: 0 });
    expect(progress.bins).toHaveLength(SIGMA_BANDS.length);
    expect(progress.bins.every((b) => b.answers === 0 && b.rate === null)).toBe(true);
  });

  it("counts questions, not attempts", () => {
    const progress = readProgress([
      misread("a", "2026-09-01T10:00:00Z"),
      read("a", "2026-09-05T10:00:00Z"),
      read("b", "2026-09-02T10:00:00Z"),
    ]);
    expect(progress.asked).toBe(2);
    expect(progress.answers).toBe(3);
  });

  // The whole reason the chart exists: a headline over everything would move
  // with the difficulty mix, so the bands have to hold FIRST answers only.
  it("bands first answers, and ignores the later ones", () => {
    const progress = readProgress([
      misread("a", "2026-09-01T10:00:00Z", 0.4),
      // The retry is right, and must not turn the bottom band into a win.
      read("a", "2026-09-05T10:00:00Z", 0.4),
      read("b", "2026-09-02T10:00:00Z", 3.9),
    ]);
    expect(progress.bins[0]).toMatchObject({ answers: 1, read: 0 });
    expect(progress.bins[3]).toMatchObject({ answers: 1, read: 1 });
  });

  it("puts an interval around a band's rate", () => {
    const progress = readProgress([
      read("a", "2026-09-01T10:00:00Z", 3.5),
      read("b", "2026-09-01T10:00:00Z", 3.5),
      misread("c", "2026-09-01T10:00:00Z", 3.5),
    ]);
    const bin = progress.bins[3];
    expect(bin.rate).toBeCloseTo(2 / 3, 5);
    // Wilson rather than the normal approximation, which at n = 3 would put the
    // top of this interval past 1.
    expect(bin.low).toBeGreaterThan(0);
    expect(bin.high).toBeLessThanOrEqual(1);
    expect(bin.low).toBeLessThan(bin.rate as number);
    expect(bin.high).toBeGreaterThan(bin.rate as number);
  });

  // Two arms and not four, and that is the selection rule rather than a
  // simplification: only a misread question is ever put back.
  it("splits a repeat into taken back and still wrong", () => {
    const progress = readProgress([
      misread("a", "2026-09-01T10:00:00Z"),
      read("a", "2026-09-05T10:00:00Z"),
      misread("b", "2026-09-01T10:00:00Z"),
      misread("b", "2026-09-05T10:00:00Z"),
      misread("c", "2026-09-01T10:00:00Z"),
    ]);
    expect(progress).toMatchObject({ askedAgain: 2, tookBack: 1, stillWrong: 1 });
    expect(progress.tookBack + progress.stillWrong).toBe(progress.askedAgain);
  });

  // A re-seed can change what a card's decks wanted. Two attempts graded against
  // different answers are two questions wearing one card's name.
  it("drops a pair whose answer moved between the attempts", () => {
    const progress = readProgress([
      row("a", "2026-09-01T10:00:00Z", "wu", "bg"),
      row("a", "2026-09-05T10:00:00Z", "wu", "wu"),
    ]);
    expect(progress).toMatchObject({ asked: 1, askedAgain: 0, tookBack: 0, stillWrong: 0 });
  });

  it("dates the record from the earliest answer", () => {
    const progress = readProgress([
      read("a", "2026-09-05T10:00:00Z"),
      read("b", "2026-09-01T10:00:00Z"),
    ]);
    expect(progress.since).toBe("2026-09-01T10:00:00Z");
  });
});
