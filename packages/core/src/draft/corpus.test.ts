import { describe, expect, it } from "vitest";
import type { SetData } from "../model/card.js";
import { fakeMixedSet, fakePlayBoosterSet, fakeSet } from "../testing/fakeSet.js";
import { cardValue } from "../scoring/value.js";
import { mulberry32 } from "../util/rng.js";
import { DraftEngine } from "./engine.js";

// The net under any change to how a card's value is stored or computed.
//
// A draft is {seed, pickedNames} replayed, so a stored session survives only as
// long as the same seed deals the same packs. Bots pick by `cardValue`, and what
// a bot takes decides what wheels back -- so a change to card storage that moves
// `cardValue` by a float moves the deal, and every draft anyone has taken stops
// replaying. That failure has happened for real (notes.md issue #4) and it is
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
function dealHash(set: SetData, seeds: number): number {
  let h = 0x811c9dc5;
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };

  for (let seed = 1; seed <= seeds; seed++) {
    const engine = new DraftEngine(set, mulberry32(seed));
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
    ["a fixed-shape set", fakeSet, 954436148],
    ["a Play Booster set", fakePlayBoosterSet, 3474325496],
    // The one that matters most for a change to how value is stored: the other
    // two sit entirely on the trusted-win-rate branch, so neither would notice a
    // baseline, blend or ALSA regression.
    ["a set with rated, thin and unrated cards", fakeMixedSet, 2349056497],
  ];

  for (const [label, build, golden] of GOLDEN) {
    it(`deals ${label} the same way it always has`, () => {
      expect(dealHash(build(), SEEDS)).toBe(golden);
    });
  }

  it("deals the same set the same way twice", () => {
    expect(dealHash(fakeSet(), 20)).toBe(dealHash(fakeSet(), 20));
  });

  it("deals different seeds differently, so the hash is measuring something", () => {
    expect(dealHash(fakeSet(), 20)).not.toBe(dealHash(fakeSet(), 21));
  });
});
