import { describe, expect, it } from "vitest";
import type { ColorCode, EngineCard } from "../model/card.js";
import { BotMemory } from "./bots.js";
import { POLICY_FEATURES, draftProgress, packOpenness, policyFeatures, policyScore } from "./policy.js";

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

// A full 15-card pack unless a test is about pack size, so `valueOpen` is at
// full strength and the other features read in isolation.
const FULL = 15;

const featuresOf = (c: EngineCard, m: BotMemory, progress = 0, packSize = FULL) =>
  Object.fromEntries(
    POLICY_FEATURES.map((f, i) => [f, policyFeatures(c, m, progress, packSize)[i]]),
  );

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

// The respecification of `openness`, and the three properties its derivation
// rests on. Each is a way the old feature was wrong, so each is worth a test:
// it must ignore your own picks (SIG-03), it must weight a late sighting above
// an early one (SIG-05), and it must read ZERO on a colour that is merely
// abundant, which is the whole failure `openness` could not avoid.
describe("signal", () => {
  it("is zero before any pack has been seen", () => {
    expect(new BotMemory().signal(blue("A"))).toBe(0);
  });

  it("ignores the card you took, because a signal is one somebody passed you", () => {
    const mine = blue("Mine");
    const m = new BotMemory();
    m.see([mine, red("A"), red("B")], mine);
    m.take(mine);

    // Blue was in the pack and is not in the signal: the only blue card there
    // was the one this bot removed.
    expect(m.signal(blue("X"))).toBe(0);
    expect(m.laneFit(blue("X"))).toBeGreaterThan(0);
  });

  // The property that makes it a signal rather than a census. Same cards, same
  // count, different pack sizes -- and only the late one is evidence.
  it("rates a colour that arrives late above one that arrives early", () => {
    const early = new BotMemory();
    early.see([blue("A"), red("B"), red("C"), ...Array.from({ length: 12 }, (_, i) => red(`F${i}`))]);

    const late = new BotMemory();
    // The same blue-to-red ratio, seen on the dregs instead of a full pack.
    late.see([blue("A"), red("B"), red("C")]);
    for (let i = 0; i < 12; i++) late.see([red(`F${i}`)]);

    expect(late.signal(blue("X"))).toBeGreaterThan(early.signal(blue("X")));
  });

  // What `openness` could not do. A colour the set simply prints more of arrives
  // in every pack at every size, so its lateness-weighted share and its overall
  // share are the same number and the difference is zero. `openness` reports the
  // abundance itself, which is a fact about the set and not about this seat.
  it("reads zero on a colour that is merely abundant", () => {
    const m = new BotMemory();
    // Blue is exactly four fifths of everything, at every pack size -- so the
    // sizes are multiples of five and the ratio does not drift with the dregs.
    for (const size of [15, 10, 5]) {
      const pack: EngineCard[] = [];
      for (let i = 0; i < size; i++) pack.push(i % 5 === 0 ? red(`R${i}`) : blue(`B${i}`));
      m.see(pack);
    }

    expect(m.openness(blue("X"))).toBeCloseTo(4 / 5, 5);
    expect(m.signal(blue("X"))).toBeCloseTo(0, 2);
  });
});

describe("valueOpen", () => {
  // The term that fixes bomb-passing. Confidence should track how much choice is
  // left in the pack, and it must RESET each pack -- which is exactly what
  // `progress` cannot do, since it climbs across all 42 picks.
  it("is at full strength on a fresh pack and near nothing on the dregs", () => {
    const m = new BotMemory();
    const bomb = card("Bomb", ["U"], 0.66);

    expect(featuresOf(bomb, m, 0, 15).valueOpen).toBeCloseTo(featuresOf(bomb, m, 0, 15).value);
    expect(featuresOf(bomb, m, 0, 2).valueOpen).toBeLessThan(
      featuresOf(bomb, m, 0, 14).valueOpen / 5,
    );
  });

  // The shape `progress` could not express: pick 1 of pack 3 is late in the
  // DRAFT and early in the PACK, and the confidence belongs to the pack.
  it("is the same at P1P1 and P3P1, however late in the draft that is", () => {
    const m = new BotMemory();
    const bomb = card("Bomb", ["U"], 0.66);

    expect(featuresOf(bomb, m, 1, 14).valueOpen).toBe(featuresOf(bomb, m, 0, 14).valueOpen);
  });

  it("carries the sign of value, so a weak card is not flattered by a full pack", () => {
    const weak = card("Weak", ["U"], 0.44);

    expect(featuresOf(weak, new BotMemory(), 0, 15).valueOpen).toBeLessThan(0);
  });

  it("stays in [0,1] for any pack a set can deal", () => {
    for (const n of [0, 1, 2, 13, 14, 15, 99]) {
      expect(packOpenness(n)).toBeGreaterThanOrEqual(0);
      expect(packOpenness(n)).toBeLessThanOrEqual(1);
    }
  });
});

describe("policyFeatures", () => {
  it("centres value on the format midpoint", () => {
    expect(featuresOf(card("A", ["U"], 0.62), new BotMemory()).value).toBeCloseTo(0.12);
    expect(featuresOf(card("A", ["U"], 0.44), new BotMemory()).value).toBeCloseTo(-0.06);
  });

  // The measured absence, kept as a test so the reasoning is not re-litigated
  // by someone noticing the gap. A colourless card and a card in a colour nobody
  // is in score identically here, which LOOKS like a modelling hole -- and
  // `--ablate` priced closing it at -0.04pp over 458k picks. See POLICY_FEATURES.
  it("does not distinguish a colourless card from one in an unplayed colour", () => {
    const m = new BotMemory();
    m.take(blue("A"));

    expect(featuresOf(card("Rock", [], 0.6), m)).toEqual(featuresOf(red("Ignored"), m));
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
    expect(late.opennessLate).toBe(m.openness(blue("X")));
  });

  // Signal-reading reaches the score ONLY through the interaction, which is what
  // the ablation found. A pick in pack 1 cannot be moved by what has flowed.
  it("ignores openness entirely at the start of the draft", () => {
    const heavilyBlue = new BotMemory();
    heavilyBlue.see([blue("A"), blue("B"), blue("C"), blue("D")]);

    expect(featuresOf(blue("X"), heavilyBlue, 0)).toEqual(
      featuresOf(blue("X"), new BotMemory(), 0),
    );
  });

  it("reuses the caller's array, because a draft scores thousands of these", () => {
    const out = new Array(POLICY_FEATURES.length);
    expect(policyFeatures(blue("A"), new BotMemory(), 0, FULL, out)).toBe(out);
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
    const weights = POLICY_FEATURES.map((_, i) => i + 1);
    const f = policyFeatures(blue("X"), m, 0.5, FULL);

    expect(policyScore(blue("X"), m, 0.5, weights, FULL)).toBeCloseTo(
      f.reduce((s, x, i) => s + x * weights[i], 0),
    );
  });
});
