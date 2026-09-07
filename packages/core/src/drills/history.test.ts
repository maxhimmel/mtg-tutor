import { describe, expect, it } from "vitest";
import {
  type DrillAnswerRow,
  answerRead,
  dueForRepeat,
  historyByQuestion,
  readProgress,
  saidFlat,
  wasFlat,
} from "./history.js";

const row = (
  key: string,
  at: string,
  answered: string,
  correct: string,
  margin = 1.2,
  setCode = "tst",
): DrillAnswerRow => ({ key, at, answered, correct, margin, setCode, format: "TradDraft" });

/** A SHARP question read right. */
const read = (key: string, at: string, margin = 1.2) => row(key, at, "wu", "wu", margin);
/** A SHARP question misread -- the other deck named. */
const misread = (key: string, at: string, margin = 1.2) => row(key, at, "bg", "wu", margin);
/** A FLAT question, answered flat. */
const flatRight = (key: string, at: string) => row(key, at, "same", "same", 0.4);
/** A FLAT question, called sharp. The `saw-difference` mistake. */
const flatWrong = (key: string, at: string) => row(key, at, "wu", "same", 0.4);
/** A SHARP question called flat. The `saw-none` mistake. */
const sawNone = (key: string, at: string, margin = 1.2) => row(key, at, "same", "wu", margin);

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
    // Keyed by the card IN A SET rather than by the card, so the test takes the
    // one entry rather than guessing at the composite id.
    const [only] = [...history.values()];
    expect(history.size).toBe(1);
    expect(only.first.at).toBe("2026-09-01T10:00:00Z");
    expect(only.latest.at).toBe("2026-09-05T10:00:00Z");
    expect(only.attempts).toBe(2);
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

describe("wasFlat / saidFlat", () => {
  // One set of words for both drills, because "these decks want it the same"
  // and "neither fast nor grindy" are the same statement about the data.
  it("knows both drills' flat answers", () => {
    expect(wasFlat({ correct: "same" })).toBe(true);
    expect(wasFlat({ correct: "middle" })).toBe(true);
    expect(wasFlat({ correct: "wu" })).toBe(false);
    expect(saidFlat({ answered: "middle" })).toBe(true);
    expect(saidFlat({ answered: "fast" })).toBe(false);
  });
});

describe("readProgress", () => {
  it("counts nothing out of nothing", () => {
    const progress = readProgress([]);
    expect(progress).toMatchObject({ asked: 0, answers: 0, askedAgain: 0, moved: 0 });
    expect(progress.discrimination).toEqual({
      flat: 0,
      calledSharp: 0,
      sharp: 0,
      calledFlat: 0,
    });
  });

  // The reading one accuracy figure cannot give: a player who always answers
  // Neither and a player who never does are opposite mistakes, and both look
  // ordinary in a single percentage.
  it("counts the two mistakes against their own denominators", () => {
    const progress = readProgress([
      flatRight("a", "2026-09-01T10:00:00Z"),
      flatRight("b", "2026-09-01T10:00:00Z"),
      flatWrong("c", "2026-09-01T10:00:00Z"),
      read("d", "2026-09-01T10:00:00Z"),
      sawNone("e", "2026-09-01T10:00:00Z"),
    ]);
    expect(progress.discrimination).toEqual({
      flat: 3,
      calledSharp: 1,
      sharp: 2,
      calledFlat: 1,
    });
  });

  it("shows an always-Neither player as perfect on one side and blind on the other", () => {
    const progress = readProgress([
      flatRight("a", "2026-09-01T10:00:00Z"),
      flatRight("b", "2026-09-01T10:00:00Z"),
      sawNone("c", "2026-09-01T10:00:00Z"),
      sawNone("d", "2026-09-01T10:00:00Z"),
    ]);
    const d = progress.discrimination;
    expect(d.calledSharp).toBe(0);
    expect(d.calledFlat).toBe(d.sharp);
  });

  // A reprint is the same name in two sets with two different answers.
  it("tells one card in two sets apart", () => {
    const progress = readProgress([
      row("shock", "2026-09-01T10:00:00Z", "wu", "wu", 1.2, "fdn"),
      row("shock", "2026-09-05T10:00:00Z", "bg", "wu", 1.2, "blb"),
    ]);
    expect(progress.asked).toBe(2);
    expect(progress.askedAgain).toBe(0);
    expect(progress.sets).toBe(2);
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
  // The two rows read FIRST answers, so a retry must not move them.
  it("reads the first answer even when the retry was right", () => {
    const progress = readProgress([
      sawNone("a", "2026-09-01T10:00:00Z"),
      read("a", "2026-09-05T10:00:00Z"),
    ]);
    expect(progress.discrimination).toMatchObject({ sharp: 1, calledFlat: 1 });
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
  it("drops a pair whose answer moved between the attempts, and says it did", () => {
    const progress = readProgress([
      row("a", "2026-09-01T10:00:00Z", "wu", "bg"),
      row("a", "2026-09-05T10:00:00Z", "wu", "wu"),
    ]);
    expect(progress).toMatchObject({
      asked: 1,
      askedAgain: 0,
      tookBack: 0,
      stillWrong: 0,
      // Counted, so a re-seed that moves many answers cannot read as nobody
      // having come back.
      moved: 1,
    });
  });

  it("dates the record from the earliest answer", () => {
    const progress = readProgress([
      read("a", "2026-09-05T10:00:00Z"),
      read("b", "2026-09-01T10:00:00Z"),
    ]);
    expect(progress.since).toBe("2026-09-01T10:00:00Z");
  });
});
