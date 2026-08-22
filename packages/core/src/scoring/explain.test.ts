import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import type { PickScore } from "./score.js";
import { explainLines, explainPick } from "./explain.js";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    value: 0.55,
    colors: ["R"],
    colorIdentity: ["R"],
    manaCost: "{1}{R}",
    cmc: 2,
    typeLine: "Creature",
    turn: 2,
    role: "creature",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.55,
    gihGames: 5000,
    alsa: 6,
    ...over,
  };
}

// This is the DETERMINISTIC fallback -- what the panel renders when the coach
// cannot be reached -- and it renders in the same place as a verdict that does
// carry its margin. It was the last surface in the flow naming a better card
// without saying whether the data can see the difference, which is how a player
// would have learned to trust the wrong one of the two. notes.md decision #8.
describe("explainPick on a pick that was not the best", () => {
  const picked = card("Lightning Strike", { gihWinRate: 0.578 });
  const better = card("Big Bomb", { gihWinRate: 0.62 });

  const score = (over: Partial<PickScore<Card>> = {}): PickScore<Card> => ({
    score: 72,
    grade: "B",
    picked,
    pickedValue: 0.578,
    pickedContextValue: 0.578,
    rawBest: better,
    rawBestValue: 0.62,
    contextBest: better,
    contextBestValue: 0.62,
    terms: [],
    isBest: false,
  indistinguishable: false,
    band: [],
    reasons: [],
    onColor: true,
    targetOnColor: true,
    rankInPack: 2,
    ...over,
  });

  it("never names a better card without the margin on the gap", () => {
    const line = explainLines(explainPick(score())).join("\n");
    expect(line).toContain("4.2pp more to this deck");
    expect(line).toContain("margin of error");
  });

  // Issue #5. The inside branch says the data cannot separate the cards; this
  // one used to print `1.2pp` beside `±1.1pp` and leave the reader to compare
  // them. Nobody does, so the narrow miss reads as a tie -- which is the same
  // mistake the coach made off the same two numbers.
  it("says the data can see the gap, rather than leaving two numbers to compare", () => {
    const line = explainLines(explainPick(score({ contextBestValue: 0.5901 }))).join("\n");
    expect(line).toContain("margin of error");
    expect(line).toContain("a gap the data can see");
  });

  // At 5000 games each the error bars run to roughly ±1pp, so a 0.4pp gap is
  // not a gap -- and this must not read as a miss. The SCORE says whether it is
  // one; this used to decide for itself, which made four places in the app hold
  // an opinion about a single question.
  it("says outright when the gap is inside the margin", () => {
    const line = explainLines(explainPick(
      score({ contextBestValue: 0.582, indistinguishable: true, band: [better] }),
    )).join("\n");
    // It names the tie rather than a card that beat it, and says the pick was
    // not marked down -- which is now true of the grade as well as the prose.
    expect(line).toContain("Nothing measurably better");
    expect(line).toContain("cannot separate it from Big Bomb");
    expect(line).toContain("not marked down");
    expect(line).not.toContain("You took");
  });

  it("does not claim a tie when the gap is real", () => {
    expect(explainLines(explainPick(score())).join("\n")).not.toContain("cannot separate it from");
  });

  // The corpus id the app itself acted on, so the fallback panel and the CLI
  // say the same thing the coach and the verdict do.
  it("names the card the deck wanted out of the tie, and the principle", () => {
    const line = explainLines(explainPick(
      score({
        contextBestValue: 0.582,
        indistinguishable: true,
        band: [better],
        preferred: better,
        reasons: [{ principle: "CURVE-04", note: "nothing comes down on turn 3" }],
      }),
    )).join("\n");

    expect(line).toContain("Big Bomb is the one this deck wanted");
    expect(line).toContain("[CURVE-04]");
  });

  it("says nothing about a preference when no principle decided one", () => {
    const line = explainLines(explainPick(
      score({ contextBestValue: 0.582, indistinguishable: true, band: [better] }),
    )).join("\n");

    expect(line).not.toContain("this deck wanted");
  });

  // An unrated card is scored off a rarity baseline, which has no sample to have
  // error bars over. Saying so is honest; inventing a margin is not.
  it("says there are no error bars rather than inventing them", () => {
    const unrated = card("No Data", { gihWinRate: undefined, gihGames: undefined });
    const line = explainLines(explainPick(score({ contextBest: unrated }))).join("\n");
    expect(line).toContain("no error bars");
    expect(line).not.toContain("±");
  });

  // The lines carry what they are FOR now, so the browser can draw a table and
  // the terminal can keep its glyphs. Issue #4A: this was never prose, and
  // typesetting it as prose under a heading that said "Coach" is most of why it
  // read as an ugly coach rather than as a readout.
  it("marks exactly one line as the verdict, and flags a caution as a caution", () => {
    const lines = explainPick(score({ onColor: false }));
    expect(lines.filter((l) => l.tone === "headline")).toHaveLength(1);
    expect(lines[0].tone).toBe("headline");
    const caution = lines.find((l) => l.tone === "caution");
    expect(caution?.text).toContain("Off your committed colors");
  });

  it("carries no glyphs of its own, because the client owns those", () => {
    for (const l of explainPick(score({ isBest: true, contextBest: picked, onColor: false }))) {
      expect(l.text).not.toMatch(/[\u2705\u26a0]/);
    }
  });

  it("says nothing about a gap when the player took the best card", () => {
    const line = explainLines(explainPick(score({ isBest: true, contextBest: picked }))).join("\n");
    expect(line).toContain("Best available");
    expect(line).not.toContain("margin of error");
  });
});
