import { describe, it, expect } from "vitest";
import type { Card, ColorWinRate } from "../model/card.js";
import type { ScoringContext } from "../scoring/context.js";
import { packScoringContext, scorePick } from "../scoring/score.js";
import {
  type Challenge,
  REASON_STARTERS,
  calibrationLine,
  challengeFor,
  claimOutcome,
  clampReason,
  confidenceLevel,
  resolveChallenge,
} from "./challenge.js";
import { deckNeeds } from "../scoring/tiebreak.js";

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

// The principle tiebreak is confined to the band the error bars cannot see
// inside, and these are the two ways that confinement could fail: firing on a
// pair the data CAN separate, and silently changing the challenger when nobody
// asked for it.
describe("challengeFor with deck needs", () => {
  const spell = (name: string, over: Partial<Card> = {}) =>
    card(name, { colors: ["R"], colorIdentity: ["R"], ...over });

  // 5,000 games each puts the error bars at roughly ±1pp.
  const bomb = spell("Big Bomb", { value: 0.62, gihWinRate: 0.62, cmc: 5, manaCost: "{5}" });
  const twoDrop = spell("Cheap Body", {
    value: 0.575,
    gihWinRate: 0.575,
    cmc: 2,
    manaCost: "{2}",
    typeLine: "Creature — Goblin",
  });
  const fiveDrop = spell("Expensive Body", {
    value: 0.578,
    gihWinRate: 0.578,
    cmc: 5,
    manaCost: "{5}",
    typeLine: "Creature — Giant",
  });
  const mine = spell("Mine", { value: 0.5, gihWinRate: 0.5 });

  // A pool ahead on bodies and cheap cards, so `toppedOut` is the live need and
  // the two candidates differ only on it.
  const pool = [
    ...Array.from({ length: 12 }, (_, i) =>
      spell(`C${i}`, { cmc: (i % 3) + 1, manaCost: `{${(i % 3) + 1}}`, typeLine: "Creature — Goblin" }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      spell(`Big${i}`, { cmc: 6, manaCost: "{6}", typeLine: "Creature — Giant" }),
    ),
  ];
  const needs = deckNeeds(pool, 21, 42);

  it("breaks a tie at the top of the pack by the deck, and says which principle", () => {
    // 0.578 vs 0.575 is a 0.3pp gap against ±1pp bars: the same card, on the
    // evidence. The float prefers the five-drop; the deck is already topped out.
    const ch = challengeFor([mine, fiveDrop, twoDrop], mine, ctx, needs);

    expect(ch?.challenger.name).toBe("Cheap Body");
    expect(ch?.reasons.map((r) => r.principle)).toContain("CURVE-03");
  });

  // The guard. A 4.2pp gap is far outside the bars, so there is no band and no
  // principle gets a vote however much the deck would prefer the other card.
  it("never reaches past a gap the data can actually see", () => {
    const ch = challengeFor([mine, bomb, twoDrop], mine, ctx, needs);

    expect(ch?.challenger.name).toBe("Big Bomb");
    expect(ch?.reasons).toEqual([]);
  });

  // Without needs the old behaviour has to stand exactly, because the server
  // and the CLI have no hydrated pool to derive them from.
  it("is unchanged when no needs are supplied", () => {
    expect(challengeFor([mine, fiveDrop, twoDrop], mine, ctx)?.challenger.name).toBe(
      "Expensive Body",
    );
  });

  // The gap and the margin have to describe the pair actually shown, or the
  // calibration line grades a comparison the player never saw.
  it("measures the gap against the card it puts up", () => {
    const ch = challengeFor([mine, fiveDrop, twoDrop], mine, ctx, needs);

    expect(ch?.challenger.name).toBe("Cheap Body");
    expect(ch?.gap).toBeCloseTo(0.075, 6);
  });
});

describe("resolveChallenge", () => {
  const challenge: Challenge = {
    challenger: card("Big Bomb", { value: 0.62 }),
    reasons: [],
    gap: 0.04,
    margin: 0.01,
    separable: true,
  };

  // The claim was about the card they NAMED, so the pair it is graded over
  // cannot depend on what they did next. Reading it from the card they finished
  // with told a player who said "clear", was shown the card that beats theirs,
  // and switched, that they had read it correctly.
  it("measures the pair from the proposed card whether or not they switched", () => {
    expect(resolveChallenge(challenge, true).edge).toBeCloseTo(-0.04, 5);
    expect(resolveChallenge(challenge, false).edge).toBeCloseTo(-0.04, 5);
  });

  it("still records which way they went", () => {
    expect(resolveChallenge(challenge, true).stood).toBe(true);
    expect(resolveChallenge(challenge, false).stood).toBe(false);
  });

  // The reading is the only prose describing this pair, and it cannot name a
  // card the outcome does not carry.
  it("carries the challenger's name for the reading to use", () => {
    expect(resolveChallenge(challenge, true).challengerName).toBe("Big Bomb");
  });
});

describe("claimOutcome", () => {
  const outcome = (over: Partial<ReturnType<typeof resolveChallenge>>) => ({
    stood: true,
    challengerName: "Big Bomb",
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

  // The bug this exists to stop: a player says "clear", is shown the card that
  // beats theirs, switches, and is told they read it right. Changing your mind
  // is a second act with its own reading -- it must not erase the first one.
  it("grades the claim the same whether they stood or switched", () => {
    expect(claimOutcome("sure", outcome({ edge: -0.04, stood: false }))).toBe("broke");
    expect(claimOutcome("sure", outcome({ edge: -0.04, stood: true }))).toBe("broke");
    expect(claimOutcome("sure", outcome({ edge: 0.04, stood: false }))).toBe("held");
    expect(claimOutcome("sure", outcome({ edge: 0.04, stood: true }))).toBe("held");
  });
});

describe("calibrationLine", () => {
  const separable = {
    stood: true,
    challengerName: "Big Bomb",
    edge: -0.04,
    margin: 0.01,
    separable: true,
  };
  const tied = { ...separable, edge: -0.002, separable: false };

  // "The two cards are 0.0pp apart" named one card and described the other, and
  // the panel above it names only the card that was taken -- so the half of the
  // pair the sentence exists to report was the half nothing on screen said.
  it("names the card theirs was argued against, in every branch", () => {
    const readings = [
      calibrationLine("sure", tied),
      calibrationLine("close", tied),
      calibrationLine("guess", tied),
      calibrationLine("sure", separable),
      calibrationLine("sure", { ...separable, edge: 0.04 }),
      calibrationLine("close", { ...separable, stood: false }),
      calibrationLine("guess", { ...separable, edge: 0.04, stood: false }),
    ];
    for (const line of readings) expect(line).toContain("Big Bomb");
  });

  // notes.md measurement trap #3 and decision #8: a gap without its margin is
  // how a rounding error came to read as a blunder.
  it("never states a gap without its margin", () => {
    expect(calibrationLine("sure", separable)).toContain("margin of error");
    expect(calibrationLine("close", tied)).toContain("margin of error");
  });

  it("says the data cannot separate the pair rather than naming a winner", () => {
    const line = calibrationLine("close", tied);
    expect(line).toContain("cannot tell the two apart");
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

  // The two decisions are graded apart, and the interesting cells are the ones
  // where they disagree. Reading the pair off the card the player finished with
  // collapsed both of these into "you read it right".
  describe("when standing and switching disagree with the claim", () => {
    // Certain, wrong, and recovered. The certainty is still wrong -- but the
    // change of mind is what saved the pick, and saying only the first half
    // would teach someone not to change their mind.
    it("credits a switch that rescued a misplaced certainty", () => {
      const line = calibrationLine("sure", { ...separable, edge: -0.04, stood: false });
      expect(line).toContain("Switching was right");
      expect(line).toContain("saved the pick");
      expect(line).toContain("margin of error");
    });

    // The flinch. They had the better card, said so, and were argued off it.
    it("names the flinch when they were right and moved anyway", () => {
      const line = calibrationLine("sure", { ...separable, edge: 0.04, stood: false });
      expect(line).toContain("talked you out of it");
      expect(line).not.toContain("and it was.");
    });

    it("does not congratulate a switch away from the better card", () => {
      const flinched = calibrationLine("close", { ...separable, edge: 0.04, stood: false });
      expect(flinched).toContain("let it go");
    });

    // Inside the margin neither act can be graded, so the honest thing to say
    // about a switch is that it changed nothing the data can see.
    it("says a switch inside the margin cost and gained nothing", () => {
      const line = calibrationLine("close", { ...tied, stood: false });
      expect(line).toContain("cannot tell the two apart");
      expect(line).toContain("neither gained nor lost");
    });

    it("says nothing about switching when they stood", () => {
      expect(calibrationLine("close", tied)).not.toContain("neither gained nor lost");
    });
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

describe("REASON_STARTERS", () => {
  // The starter is written into the same field the player types in, and the
  // server clamps that field. One over the limit is a defence that arrives
  // truncated mid-word, which is worse than the blank it replaced.
  it("fits the field it fills", () => {
    for (const s of REASON_STARTERS) {
      expect(clampReason(s.text)).toBe(s.text);
    }
  });

  // The UI lights the starter matching what is in the box, and keys the buttons
  // by label. Two of either collapses a pair into one control.
  it("has no duplicate label or text", () => {
    expect(new Set(REASON_STARTERS.map((s) => s.label)).size).toBe(REASON_STARTERS.length);
    expect(new Set(REASON_STARTERS.map((s) => s.text)).size).toBe(REASON_STARTERS.length);
  });

  // What lands in the box is read by the coach as the player's own words, so a
  // fragment reads as a sentence that got cut off rather than as a defence.
  it("puts a whole sentence in the box", () => {
    for (const s of REASON_STARTERS) {
      expect(s.text).toMatch(/^[A-Z].*\.$/);
    }
  });

  // The label rides on a btn-xs alongside nine others and a lead-in. Long
  // enough to wrap to a third row is long enough to be a sentence, which is
  // what the box below is for.
  it("keeps the labels short enough to sit on one control", () => {
    for (const s of REASON_STARTERS) {
      expect(s.label.length).toBeLessThanOrEqual(12);
    }
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
