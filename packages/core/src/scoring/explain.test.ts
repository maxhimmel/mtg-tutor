import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import type { PickScore } from "./score.js";
import { explainPick } from "./explain.js";

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
    const line = explainPick(score()).join("\n");
    expect(line).toContain("4.2pp more to this deck");
    expect(line).toContain("margin of error");
  });

  // At 5000 games each the error bars run to roughly ±1pp, so a 0.4pp gap is
  // not a gap -- and this must not read as a miss. The SCORE says whether it is
  // one; this used to decide for itself, which made four places in the app hold
  // an opinion about a single question.
  it("says outright when the gap is inside the margin", () => {
    const line = explainPick(
      score({ contextBestValue: 0.582, indistinguishable: true, band: [better] }),
    ).join("\n");
    // It names the tie rather than a card that beat it, and says the pick was
    // not marked down -- which is now true of the grade as well as the prose.
    expect(line).toContain("Nothing measurably better");
    expect(line).toContain("cannot separate it from Big Bomb");
    expect(line).toContain("not marked down");
    expect(line).not.toContain("You took");
  });

  it("does not claim a tie when the gap is real", () => {
    expect(explainPick(score()).join("\n")).not.toContain("cannot separate it from");
  });

  // The corpus id the app itself acted on, so the fallback panel and the CLI
  // say the same thing the coach and the verdict do.
  it("names the card the deck wanted out of the tie, and the principle", () => {
    const line = explainPick(
      score({
        contextBestValue: 0.582,
        indistinguishable: true,
        band: [better],
        preferred: better,
        reasons: [{ principle: "CURVE-04", note: "nothing comes down on turn 3" }],
      }),
    ).join("\n");

    expect(line).toContain("Big Bomb is the one this deck wanted");
    expect(line).toContain("[CURVE-04]");
  });

  it("says nothing about a preference when no principle decided one", () => {
    const line = explainPick(
      score({ contextBestValue: 0.582, indistinguishable: true, band: [better] }),
    ).join("\n");

    expect(line).not.toContain("this deck wanted");
  });

  // An unrated card is scored off a rarity baseline, which has no sample to have
  // error bars over. Saying so is honest; inventing a margin is not.
  it("says there are no error bars rather than inventing them", () => {
    const unrated = card("No Data", { gihWinRate: undefined, gihGames: undefined });
    const line = explainPick(score({ contextBest: unrated })).join("\n");
    expect(line).toContain("no error bars");
    expect(line).not.toContain("±");
  });

  it("says nothing about a gap when the player took the best card", () => {
    const line = explainPick(score({ isBest: true, contextBest: picked })).join("\n");
    expect(line).toContain("Best available");
    expect(line).not.toContain("margin of error");
  });
});
