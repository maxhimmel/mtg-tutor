import { describe, it, expect } from "vitest";
import type { Card, ColorWinRate } from "../model/card.js";
import type { ScoringContext } from "../scoring/context.js";
import { packScoringContext, scorePick } from "../scoring/score.js";
import {
  type Challenge,
  calibrationLine,
  challengeFor,
  claimOutcome,
  confidenceLevel,
  resolveChallenge,
} from "./challenge.js";

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

// No archetype table and no per-card context, so contextValue is cardValue and
// the ranking is the cards' own `value`. That is exactly what the challenger
// rule is about -- which card, not how it was valued.
const archetypes: ColorWinRate[] = [{ colors: "WU", n: 1000, wr: 0.55 }];
const ctx: ScoringContext = {
  colors: new Set(),
  commitment: 0,
  archetypes,
  contextFor: () => undefined,
};

describe("challengeFor", () => {
  const best = card("Big Bomb", { value: 0.62, gihWinRate: 0.62 });
  const second = card("Solid Removal", { value: 0.58, gihWinRate: 0.58 });
  const filler = card("Bear", { value: 0.51, gihWinRate: 0.51 });
  const pack = [filler, best, second];

  it("puts up the best card in the pack when the player did not take it", () => {
    expect(challengeFor(pack, filler, ctx)?.challenger.name).toBe("Big Bomb");
  });

  // The rule that keeps the challenge from being the verdict. If being
  // challenged only happened on a miss, switching every time would be free.
  it("puts up the runner-up when the player DID take the best card", () => {
    expect(challengeFor(pack, best, ctx)?.challenger.name).toBe("Solid Removal");
  });

  it("measures the gap from the challenger to the proposed card", () => {
    const ch = challengeFor(pack, second, ctx);
    expect(ch?.gap).toBeCloseTo(0.04, 5);
  });

  it("reports the gap as negative when the player is already ahead", () => {
    expect(challengeFor(pack, best, ctx)?.gap).toBeCloseTo(-0.04, 5);
  });

  it("has nothing to argue with in a pack of one", () => {
    expect(challengeFor([best], best, ctx)).toBeUndefined();
  });

  it("carries the margin of error on the pair", () => {
    expect(challengeFor(pack, filler, ctx)?.margin).toBeGreaterThan(0);
  });

  // At 5000 games each the error bars run to roughly ±1pp, so a 0.2pp gap is not
  // a gap the data can see -- the case notes.md's measurement trap #3 is about.
  it("calls a pair inside the margin inseparable", () => {
    const near = card("Near Enough", { value: 0.582, gihWinRate: 0.582 });
    expect(challengeFor([best, near], near, ctx)?.separable).toBe(true);
    expect(challengeFor([second, near], second, ctx)?.separable).toBe(false);
  });

  // An unmeasurable margin is not evidence of a tie, and treating it as one
  // would let every unrated card claim the pick was too close to call.
  it("does not call an unrated pair inseparable", () => {
    const unrated = card("No Data", { value: 0.55, gihWinRate: undefined, gihGames: undefined });
    const ch = challengeFor([best, unrated], unrated, ctx);
    expect(ch?.margin).toBeUndefined();
    expect(ch?.separable).toBe(true);
  });
});

describe("resolveChallenge", () => {
  const challenge: Challenge = {
    challenger: card("Big Bomb", { value: 0.62 }),
    gap: 0.04,
    margin: 0.01,
    separable: true,
  };

  it("flips the sign when the player stands their ground", () => {
    expect(resolveChallenge(challenge, true).edge).toBeCloseTo(-0.04, 5);
  });

  it("keeps it when they switch to the challenger", () => {
    expect(resolveChallenge(challenge, false).edge).toBeCloseTo(0.04, 5);
  });
});

describe("claimOutcome", () => {
  const outcome = (over: Partial<ReturnType<typeof resolveChallenge>>) => ({
    stood: true,
    edge: 0.04,
    margin: 0.01,
    separable: true,
    ...over,
  });

  it('holds "Clear" when the data separates the pair in the player\'s favour', () => {
    expect(claimOutcome("sure", outcome({}))).toBe("held");
  });

  it('breaks "Clear" when the pair goes the other way', () => {
    expect(claimOutcome("sure", outcome({ edge: -0.04 }))).toBe("broke");
  });

  // Certainty on a pair the data cannot separate is wrong even when the card is
  // fine -- the claim was about the margin, and the margin says no.
  it('breaks "Clear" on a pair the data cannot separate, however the pick landed', () => {
    expect(claimOutcome("sure", outcome({ separable: false }))).toBe("broke");
    expect(claimOutcome("sure", outcome({ separable: false, edge: -0.001 }))).toBe("broke");
  });

  it('holds "Close" exactly when the pair is inseparable', () => {
    expect(claimOutcome("close", outcome({ separable: false }))).toBe("held");
    expect(claimOutcome("close", outcome({}))).toBe("broke");
  });

  // Not a middle grade. Someone who said they were guessing made no claim, and
  // grading them against one would punish the only honest answer available.
  it("grades a guess as no claim at all", () => {
    expect(claimOutcome("guess", outcome({}))).toBe("none");
    expect(claimOutcome("guess", outcome({ edge: -0.04, separable: false }))).toBe("none");
  });
});

describe("calibrationLine", () => {
  const separable = { stood: true, edge: -0.04, margin: 0.01, separable: true };
  const tied = { stood: true, edge: -0.002, margin: 0.01, separable: false };

  // notes.md measurement trap #3 and decision #8: a gap without its margin is
  // how a rounding error came to read as a blunder.
  it("never states a gap without its margin", () => {
    expect(calibrationLine("sure", separable)).toContain("margin of error");
    expect(calibrationLine("close", tied)).toContain("margin of error");
  });

  it("says the data cannot separate the pair rather than naming a winner", () => {
    const line = calibrationLine("close", tied);
    expect(line).toContain("cannot tell them apart");
    expect(line).toContain("You read that correctly");
  });

  it("refuses certainty on an inseparable pair even when the card was fine", () => {
    expect(calibrationLine("sure", tied)).toContain("not available here");
  });

  // An unrated card has no sample to have error bars over, so the honest answer
  // is that the size of the miss is unknown -- not a margin invented for it.
  it("says outright when there is no margin to quote", () => {
    const line = calibrationLine("sure", { ...separable, margin: undefined });
    expect(line).toContain("no margin available");
    expect(line).not.toContain("±");
  });

  it("credits a guess that landed instead of scolding it", () => {
    expect(calibrationLine("guess", { ...separable, edge: 0.04 })).toContain(
      "right anyway",
    );
  });
});

// The one way this flow could quietly lie: the browser names a card to argue
// against, the server grades against a different one, and nothing anywhere
// reports the disagreement. Both sides go through packScoringContext for exactly
// this reason, so the guard is that the two answers are the same card -- built
// here from a context with real archetype splits, so contextValue is actually
// doing work rather than falling back to cardValue.
describe("the challenger and the card the pick is graded against", () => {
  const splits: ColorWinRate[] = [
    { colors: "W", n: 4000, wr: 0.53 },
    { colors: "WU", n: 60000, wr: 0.57 },
    { colors: "WUB", n: 5000, wr: 0.53 },
  ];

  // Worth less on raw power, worth much more inside the deck being built -- the
  // whole reason contextBest and rawBest are separate answers.
  const fits = card("Archetype Fit", { value: 0.56, gihWinRate: 0.56, colors: ["W"] });
  const raw = card("Raw Power", { value: 0.6, gihWinRate: 0.6, colors: ["R"] });
  const filler = card("Bear", { value: 0.5, gihWinRate: 0.5, colors: ["W"] });
  const pack = [filler, raw, fits];

  const maindeck = [
    card("White One", { colors: ["W"], value: 0.56 }),
    card("White Two", { colors: ["W"], value: 0.56 }),
    card("Blue One", { colors: ["U"], value: 0.56 }),
    card("Blue Two", { colors: ["U"], value: 0.56 }),
  ];
  const deckCtx = packScoringContext(maindeck, 20, 45, splits, (c) =>
    c.name === "Archetype Fit" ? { archWr: { WU: 0.68 } } : undefined,
  );

  const contextBest = scorePick(pack, filler, maindeck, deckCtx).contextBest;

  it("names the same card the grade is measured against", () => {
    expect(contextBest.name).toBe("Archetype Fit");
    expect(challengeFor(pack, filler, deckCtx)?.challenger.name).toBe(contextBest.name);
  });

  // The rule read from the other end. Taking the card the grade is measured
  // against has to leave something else to argue with, or the flow would have
  // nothing to say on every pick the player got right.
  it("falls to another card once the player has taken that one", () => {
    const challenger = challengeFor(pack, contextBest, deckCtx)?.challenger;
    expect(challenger).toBeDefined();
    expect(challenger?.name).not.toBe(contextBest.name);
  });

  // contextBest, never rawBest -- notes.md decision #10, got wrong three times.
  it("does not fall back to the raw-power best when the deck wants another card", () => {
    const scored = scorePick(pack, filler, maindeck, deckCtx);
    expect(scored.rawBest.name).toBe("Raw Power");
    expect(challengeFor(pack, filler, deckCtx)?.challenger.name).not.toBe(scored.rawBest.name);
  });
});

describe("confidenceLevel", () => {
  // The player is graded against the claim, so the claim has to be on screen
  // beside the control that makes it.
  it("carries the claim each level makes, not just its label", () => {
    expect(confidenceLevel("sure").claim).toContain("margin of error");
    expect(confidenceLevel("close").claim).toContain("margin of error");
    expect(confidenceLevel("guess").claim).toContain("no claim");
  });
});
