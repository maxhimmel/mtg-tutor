import { describe, expect, it } from "vitest";
import type { SetData } from "../model/card.js";
import { fakeMixedSet, fakePlayBoosterSet, fakeSet } from "../testing/fakeSet.js";
import { cardValue } from "../scoring/value.js";
import { mulberry32 } from "../util/rng.js";
import { botRng, dealDraft } from "./deal.js";
import { DraftEngine } from "./engine.js";
import { STORED_PODS, type PodPolicy, type StoredPod } from "./bots.js";

// The net under any change to how a card's value is stored or computed.
//
// A draft is {seed, pickedNames} replayed, so a stored session survives only as
// long as the same seed deals the same packs. Bots pick by `cardValue`, and what
// a bot takes decides what wheels back -- so a change to card storage that moves
// `cardValue` by a float moves the deal, and every draft anyone has taken stops
// replaying. That failure has happened for real (notes.md issue #3) and it is
// not repairable: the packs the draft saw no longer exist.
//
// Nothing else asserts this. `replay.test.ts` compares a live draft against its
// own replay in the same build, which cannot notice that the build moved.
//
// Verified by perturbation, one branch of `cardValue` at a time: the trusted
// win rate, the thin-sample blend, the ALSA nudge and the rarity baseline each
// move at least one hash below. The `?? 0.51` tail does not, and cannot -- every
// member of `Rarity` is a key of `RARITY_BASELINE`, so it is unreachable.

// FNV-1a over the whole deal, not just the picks: two bots taking different
// cards can leave the human the same choice, and only the packs show it.
function dealHash(set: SetData, seeds: number, pod: PodPolicy = "legacy"): number {
  let h = 0x811c9dc5;
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };

  for (let seed = 1; seed <= seeds; seed++) {
    const engine = new DraftEngine(dealDraft(set, seed), botRng(seed), pod);
    while (!engine.isComplete()) {
      const pack = engine.currentPack;
      eat(pack.map((c) => c.name).join(","));
      const best = [...pack].sort((a, b) => cardValue(b) - cardValue(a))[0];
      eat(best.name);
      engine.humanPick(best);
    }
  }
  return h;
}

const SEEDS = 500;

describe("the deal is stable across a corpus of seeds", () => {
  // Golden values. If one of these moves, a storage or scoring change has
  // changed what the seed deals -- do not update the number until you know
  // which change did it and that stranding every existing draft is intended.
  const GOLDEN: [string, () => SetData, number][] = [
    ["a fixed-shape set", fakeSet, 179877333],
    // Moved deliberately when basic lands stopped being valued as the median
    // rated common: bots no longer take them, so what wheels changed. Only this
    // fixture has basics, and only this hash moved -- which is what says the
    // change is confined to them.
    ["a Play Booster set", fakePlayBoosterSet, 1208041874],
    // The one that matters most for a change to how value is stored: the other
    // two sit entirely on the trusted-win-rate branch, so neither would notice a
    // baseline, blend or ALSA regression.
    ["a set with rated, thin and unrated cards", fakeMixedSet, 2755347920],
  ];

  for (const [label, build, golden] of GOLDEN) {
    it(`deals ${label} the same way it always has`, () => {
      expect(dealHash(build(), SEEDS)).toBe(golden);
    });
  }

  // The invariant behind precomputing `cardValue` at ingest. Bots pick by it, so
  // if the stored answer differs from the formula by a float the seed deals
  // different packs and every draft in that set stops replaying. Asserted on the
  // mixed set because that is the one whose cards span all four branches.
  it("deals identically whether value is stored or computed on read", () => {
    const computed = fakeMixedSet();
    const stored: SetData = {
      ...computed,
      cards: computed.cards.map((c) => ({ ...c, value: cardValue(c) })),
      pools: Object.fromEntries(
        Object.entries(computed.pools).map(([slot, cards]) => [
          slot,
          cards.map((c) => ({ ...c, value: cardValue(c) })),
        ]),
      ) as SetData["pools"],
    };
    expect(dealHash(stored, SEEDS)).toBe(dealHash(computed, SEEDS));
  });

  it("deals the same set the same way twice", () => {
    expect(dealHash(fakeSet(), 20)).toBe(dealHash(fakeSet(), 20));
  });

  it("deals different seeds differently, so the hash is measuring something", () => {
    expect(dealHash(fakeSet(), 20)).not.toBe(dealHash(fakeSet(), 21));
  });
});

// The same net under the fitted pods, and it catches something BOT_FINGERPRINT
// cannot.
//
// That fingerprint hashes the weights and the feature NAMES, so it notices a
// re-fit or a reordered vector. It cannot notice a change to what the features
// MEAN: rewrite `laneFit`'s formula, or `BotMemory.see`, or the Gumbel draw, or
// how the engine computes `progress`, and every weight is untouched while the
// deal moves underneath every draft that stored one of these names.
//
// So both guards are needed, and they fail differently on purpose: the
// fingerprint says "you changed the weights", these say "you changed the deal".
describe("the fitted pods deal the same way they always have", () => {
  const SETS: [string, () => SetData][] = [
    ["a fixed-shape set", fakeSet],
    ["a Play Booster set", fakePlayBoosterSet],
    ["a set with rated, thin and unrated cards", fakeMixedSet],
  ];

  // Keyed by pod and generated from `STORED_PODS` below, because for a year
  // this block pinned `table` and `sharks` and nothing else -- the two pods
  // NOBODY DRAFTS AGAINST. `table2` has been the default since it was fitted,
  // so every draft anyone has taken since replays against a policy no test
  // held still, which is the one case the whole file exists for.
  //
  // Adding a pod without adding a row here is now a failure rather than an
  // omission: the coverage test below reads `STORED_PODS`, which is derived
  // from the type, so a new name arrives with an empty column and says so.
  const GOLDEN: Record<StoredPod, number[]> = {
    table: [3316268996, 2404736845, 1634392860],
    sharks: [2348276992, 3307669095, 166620893],
    table2: [671376058, 488123354, 1009150014],
    sharks2: [1917749292, 500239768, 2941289290],
  };

  for (const [pod, hashes] of Object.entries(GOLDEN) as [StoredPod, number[]][])
    SETS.forEach(([label, build], i) => {
      it(`deals ${label} to the ${pod} pod`, () => {
        expect(dealHash(build(), SEEDS, pod)).toBe(hashes[i]);
      });
    });

  it("pins every pod a session can carry", () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...STORED_PODS].sort());
    for (const hashes of Object.values(GOLDEN)) expect(hashes).toHaveLength(SETS.length);
  });

  // The control. Two pods that dealt identically would make every hash above
  // pass while measuring nothing -- and `sharks` differs from `table` mostly in
  // one coefficient, so this is not a hypothetical.
  it("deals every pod differently from every other", () => {
    const hashes = ["legacy" as const, ...STORED_PODS].map((pod) =>
      dealHash(fakeSet(), 50, pod),
    );
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
