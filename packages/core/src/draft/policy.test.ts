import { describe, expect, it } from "vitest";
import type { ColorCode, EngineCard } from "../model/card.js";
import { BotMemory } from "./bots.js";
import { POLICY_FEATURES, draftProgress, policyFeatures, policyScore } from "./policy.js";

// The features a fitted bot policy reads. Two things are actually at stake here.
//
// The SHARES have to stay bounded, because their coefficients are constants for
// a whole draft -- a feature that grows with the pool would mean one thing at
// pick 3 and another at pick 40, and the fit would split the difference badly.
//
// And `openness` must not be able to see the pack it is being asked about. If it
// can, the fit learns "take whatever colour this pack is heavy in", which is a
// statement about one booster rather than about what is flowing -- and it would
// look like a working signal-reader in every aggregate number.

const card = (name: string, colors: ColorCode[], value: number, slot?: string): EngineCard =>
  ({ name, colors, value, ...(slot ? { slot } : {}) }) as EngineCard;

// 0.6 is comfortably above the 0.5 midpoint, so each of these contributes 0.1 of
// quality; a 0.4 card contributes nothing, which is the clamp being exercised.
const blue = (n: string) => card(n, ["U"], 0.6);
const red = (n: string) => card(n, ["R"], 0.6);
const chaff = (n: string) => card(n, ["R"], 0.4);

const featuresOf = (c: EngineCard, m: BotMemory, progress = 0) =>
  Object.fromEntries(POLICY_FEATURES.map((f, i) => [f, policyFeatures(c, m, progress)[i]]));

describe("laneFit", () => {
  it("is zero before anything has been taken, rather than NaN", () => {
    expect(new BotMemory().laneFit(blue("A"))).toBe(0);
  });

  it("is the share of taken quality sitting in the card's colour", () => {
    const m = new BotMemory();
    m.take(blue("A"));
    m.take(blue("B"));
    m.take(red("C"));

    expect(m.laneFit(blue("D"))).toBeCloseTo(2 / 3);
    expect(m.laneFit(red("D"))).toBeCloseTo(1 / 3);
  });

  it("ignores cards below the midpoint, so chaff cannot claim a lane", () => {
    const m = new BotMemory();
    m.take(blue("A"));
    for (let i = 0; i < 10; i++) m.take(chaff(`R${i}`));

    expect(m.laneFit(blue("D"))).toBe(1);
    expect(m.laneFit(red("D"))).toBe(0);
  });

  it("stays in [0,1] however long the draft runs", () => {
    const m = new BotMemory();
    for (let i = 0; i < 45; i++) m.take(i % 2 ? blue(`B${i}`) : red(`R${i}`));

    const fit = m.laneFit(blue("D"));
    expect(fit).toBeGreaterThan(0);
    expect(fit).toBeLessThanOrEqual(1);
  });
});

describe("openness", () => {
  it("is zero before any pack has been seen", () => {
    expect(new BotMemory().openness(blue("A"))).toBe(0);
  });

  it("reads the colour of what has flowed, not of what was taken", () => {
    const m = new BotMemory();
    // Four blue cards passed through, one red. Nothing taken at all.
    m.see([blue("A"), blue("B"), blue("C"), blue("D"), red("E")]);

    expect(m.laneFit(blue("X"))).toBe(0);
    expect(m.openness(blue("X"))).toBeCloseTo(4 / 5);
    expect(m.openness(red("X"))).toBeCloseTo(1 / 5);
  });

  // The ordering property, and the reason `Bot.pick` calls see() after its
  // scoring loop. A pack in hand must not raise its own colours' openness.
  it("does not include the pack currently being scored", () => {
    const m = new BotMemory();
    m.see([red("Seen1"), red("Seen2")]);

    const packInHand = [blue("New1"), blue("New2"), blue("New3")];
    const before = m.openness(packInHand[0]);
    m.see(packInHand);

    expect(before).toBe(0);
    expect(m.openness(packInHand[0])).toBeGreaterThan(0);
  });
});

describe("policyFeatures", () => {
  it("centres value on the format midpoint", () => {
    expect(featuresOf(card("A", ["U"], 0.62), new BotMemory()).value).toBeCloseTo(0.12);
    expect(featuresOf(card("A", ["U"], 0.44), new BotMemory()).value).toBeCloseTo(-0.06);
  });

  it("separates a colourless card from one in a colour nobody is in", () => {
    const m = new BotMemory();
    const artifact = featuresOf(card("Rock", [], 0.6), m);
    const ignored = featuresOf(blue("Ignored"), m);

    // Both score 0 on the two shares, which is exactly why `colorless` exists.
    expect(artifact.laneFit).toBe(ignored.laneFit);
    expect(artifact.openness).toBe(ignored.openness);
    expect(artifact.colorless).toBe(1);
    expect(ignored.colorless).toBe(0);
  });

  it("flags rares and mythics, and nothing else", () => {
    const m = new BotMemory();
    expect(featuresOf(card("R", ["U"], 0.6, "rare"), m).rare).toBe(1);
    expect(featuresOf(card("M", ["U"], 0.6, "mythic"), m).rare).toBe(1);
    expect(featuresOf(card("C", ["U"], 0.6, "common"), m).rare).toBe(0);
    expect(featuresOf(card("N", ["U"], 0.6), m).rare).toBe(0);
  });

  it("zeroes the interactions at the start of the draft and matches them at the end", () => {
    const m = new BotMemory();
    m.take(blue("A"));
    m.see([blue("B"), red("C")]);

    const early = featuresOf(blue("X"), m, 0);
    const late = featuresOf(blue("X"), m, 1);

    expect(early.laneFitLate).toBe(0);
    expect(early.opennessLate).toBe(0);
    expect(late.laneFitLate).toBe(late.laneFit);
    expect(late.opennessLate).toBe(late.openness);
  });

  it("reuses the caller's array, because a draft scores thousands of these", () => {
    const out = new Array(POLICY_FEATURES.length);
    expect(policyFeatures(blue("A"), new BotMemory(), 0, out)).toBe(out);
  });
});

describe("draftProgress", () => {
  it("runs 0 to 1 across the draft", () => {
    expect(draftProgress(0, 42)).toBe(0);
    expect(draftProgress(41, 42)).toBe(1);
    expect(draftProgress(20, 42)).toBeCloseTo(20 / 41);
  });

  it("clamps rather than extrapolating past the end", () => {
    expect(draftProgress(99, 42)).toBe(1);
    expect(draftProgress(-1, 42)).toBe(0);
    expect(draftProgress(0, 1)).toBe(0);
  });
});

describe("policyScore", () => {
  it("is the dot product of the weights and the features", () => {
    const m = new BotMemory();
    m.take(blue("A"));
    const weights = [1, 2, 3, 4, 5, 6, 7];
    const f = policyFeatures(blue("X"), m, 0.5);

    expect(policyScore(blue("X"), m, 0.5, weights)).toBeCloseTo(
      f.reduce((s, x, i) => s + x * weights[i], 0),
    );
  });
});
