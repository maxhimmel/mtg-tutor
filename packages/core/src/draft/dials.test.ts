import { describe, expect, it } from "vitest";
import type { ColorCode, EngineCard } from "../model/card.js";
import { BotMemory } from "./bots.js";
import { FITTED_POLICIES, POLICY_FEATURES, policyFeatures, policyScore } from "./policy.js";
import {
  BUNDLE_COLUMNS,
  DIAL_BUNDLES,
  NEUTRAL_DIALS,
  bundleScores,
  bundleSpread,
  dialPicksFrom,
  dialledScore,
} from "./dials.js";

// The one property everything downstream rests on: at theta = 1 the dialled
// model is not LIKE the pod, it IS the pod, to the last bit. Everything a
// drafter's fit reports is a deviation from that point, so if the point drifts
// -- a new policy feature nobody bundled, a column counted twice -- every
// reading moves with it and nothing else in the app would notice.

const card = (
  name: string,
  colors: ColorCode[],
  value: number,
  extra: Partial<EngineCard> = {},
): EngineCard => ({ name, colors, value, ...extra }) as EngineCard;

const pack = (): EngineCard[] => [
  card("Bomb", ["U"], 0.62, { slot: "mythic", role: "evasion", turn: 5, tableValue: 0.71 }),
  card("Removal", ["R"], 0.575, { slot: "common", role: "removal", turn: 2, tableValue: 0.6 }),
  card("Body", ["U"], 0.55, { slot: "uncommon", role: "creature", turn: 3, tableValue: 0.54 }),
  card("Filler", ["G"], 0.48, { slot: "common", role: "creature", turn: 4, tableValue: 0.47 }),
  card("Artifact", [], 0.52, { slot: "rare", role: "creature", turn: 2, tableValue: 0.58 }),
];

const memoryAfter = (taken: readonly EngineCard[], seen: readonly EngineCard[][]) => {
  const m = new BotMemory();
  for (const c of taken) m.take(c);
  for (const p of seen) m.see(p);
  return m;
};

describe("the bundles partition the policy", () => {
  it("covers every policy feature exactly once", () => {
    const columns = BUNDLE_COLUMNS.flat().sort((a, b) => a - b);
    expect(columns).toEqual(POLICY_FEATURES.map((_, i) => i));
  });

  it("names a bundle for every feature, so a new column cannot be dropped silently", () => {
    const named = DIAL_BUNDLES.flatMap((b) => b.features as readonly string[]);
    expect([...named].sort()).toEqual([...POLICY_FEATURES].sort());
  });
});

describe("dialledScore at theta = 1", () => {
  // Every shipped pod, not just the default: `table` and `sharks` are seven long
  // and the rest are ten, and `policyScore` iterates the WEIGHTS rather than the
  // feature row. A bundle summing columns a short vector never had must come out
  // at zero rather than at undefined-times-something.
  for (const [pod, weights] of Object.entries(FITTED_POLICIES)) {
    it(`reproduces ${pod}'s own policyScore exactly`, () => {
      const cards = pack();
      const memory = memoryAfter([cards[0], cards[1]], [cards]);

      for (const c of cards) {
        const f = policyFeatures(c, memory, 0.4, cards.length);
        const dialled = dialledScore(bundleScores(f, weights), NEUTRAL_DIALS);
        expect(dialled).toBeCloseTo(policyScore(c, memory, 0.4, weights, cards.length), 12);
      }
    });
  }

  it("holds at the ends of the draft too, where the interactions are extreme", () => {
    const weights = FITTED_POLICIES.table3;
    const cards = pack();

    for (const [progress, packSize] of [
      [0, 15],
      [1, 1],
      [0.5, 8],
    ] as const) {
      const memory = memoryAfter([cards[0]], [cards]);
      for (const c of cards) {
        const f = policyFeatures(c, memory, progress, packSize);
        expect(dialledScore(bundleScores(f, weights), NEUTRAL_DIALS)).toBeCloseTo(
          policyScore(c, memory, progress, weights, packSize),
          12,
        );
      }
    }
  });
});

describe("a dial moves only its own bundle", () => {
  it("changes the score by exactly that bundle's contribution", () => {
    const weights = FITTED_POLICIES.table3;
    const cards = pack();
    const memory = memoryAfter([cards[0], cards[2]], [cards]);
    const f = policyFeatures(cards[1], memory, 0.6, cards.length);
    const bundles = bundleScores(f, weights);

    const lane = DIAL_BUNDLES.findIndex((b) => b.id === "lane");
    const theta = [...NEUTRAL_DIALS];
    theta[lane] = 2;

    expect(dialledScore(bundles, theta) - dialledScore(bundles, NEUTRAL_DIALS)).toBeCloseTo(
      bundles[lane],
      12,
    );
  });
});

describe("dialPicksFrom", () => {
  const weights = FITTED_POLICIES.table3;
  const signal = DIAL_BUNDLES.findIndex((b) => b.id === "signal");
  const rows = () => {
    const first = pack();
    const second = pack().map((c) => ({ ...c, name: `${c.name} II` }));
    return [
      { pack: first, picked: first[0] },
      { pack: second, picked: second[1] },
    ];
  };

  it("scores a pack BEFORE recording it as seen", () => {
    // Nothing has flowed at the first pick, so `openness` is zero for every card
    // on offer. Call `see` a line early and the first pack becomes its own
    // signal -- the fit then learns "take whatever colour this pack is heavy
    // in", which looks like signal-reading in every aggregate.
    const [first] = dialPicksFrom(rows(), weights);
    for (const card of first.bundles) expect(card[signal]).toBe(0);
  });

  it("has something to say about openness by the second pick", () => {
    const [, second] = dialPicksFrom(rows(), weights);
    expect(second.bundles.some((card) => card[signal] !== 0)).toBe(true);
  });

  it("records which card was taken, by position in the pack", () => {
    const picks = dialPicksFrom(rows(), weights);
    expect(picks.map((p) => p.chosen)).toEqual([0, 1]);
  });

  it("skips a pick whose card is not in its own pack rather than taking index 0", () => {
    const cards = pack();
    const picks = dialPicksFrom(
      [{ pack: cards, picked: card("Not In This Pack", ["W"], 0.5) }],
      weights,
    );
    expect(picks).toEqual([]);
  });

  it("keeps the dregs, because the pod it is measured against was fitted on them", () => {
    const cards = pack().slice(0, 2);
    expect(dialPicksFrom([{ pack: cards, picked: cards[0] }], weights)).toHaveLength(1);
  });
});

describe("bundleSpread", () => {
  it("is what varies WITHIN a pack, so a bundle constant across it reads as zero", () => {
    // Three candidates whose second bundle differs and whose first does not.
    const packs = [
      [
        [1, 0],
        [1, 4],
        [1, -4],
      ],
    ];
    const [flat, moving] = bundleSpread(packs);
    expect(flat).toBe(0);
    expect(moving).toBeGreaterThan(0);
  });

  it("ignores a pack with nothing to choose between", () => {
    expect(bundleSpread([[[5, 5]]])).toEqual([0, 0]);
  });

  it("prices removal near nothing under table3, which is why it cannot be dialled", () => {
    const weights = FITTED_POLICIES.table3;
    const cards = pack();
    const memory = memoryAfter([cards[0]], [cards]);
    const rows = cards.map((c) => bundleScores(policyFeatures(c, memory, 0.5, cards.length), weights));

    const spread = bundleSpread([rows]);
    const at = (id: string) => spread[DIAL_BUNDLES.findIndex((b) => b.id === id)];

    // Not an arbitrary ratio: `removal` is 0.0515 in table3 against 7.6196 for
    // `laneFitLate`, so the two cannot be within an order of magnitude of each
    // other however the pack is shaped.
    expect(at("removal")).toBeLessThan(at("lane") / 10);
    expect(at("removal")).toBeLessThan(at("table") / 10);
  });
});
