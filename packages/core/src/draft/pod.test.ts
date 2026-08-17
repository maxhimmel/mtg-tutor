import { describe, expect, it } from "vitest";
import type { PodPolicy } from "./bots.js";
import { fakeSet } from "../testing/fakeSet.js";
import { cardValue } from "../scoring/value.js";
import { mulberry32 } from "../util/rng.js";
import { botRng, dealDraft } from "./deal.js";
import { DraftEngine } from "./engine.js";
import { replayDraft } from "./replay.js";

// What a second bot policy is allowed to change, and what it is not.
//
// It changes the deal, which is the whole point and is why a session records
// which pod it was dealt against. It must NOT change how many random numbers a
// draft consumes: `forkImpact` re-runs a pod with one pick swapped and reads the
// difference, and that is a controlled experiment only because every bot draws
// exactly one number per card in its hand and the human draws none. Break that
// and fork weights stop measuring anything, without failing.

/**
 * Drives a whole draft, counting draws, always taking the highest-value card.
 *
 * The counter now sees BOT DRAWS ONLY: the deal has its own stream and is
 * settled before the first pick, so nothing it consumes reaches this rng. That
 * makes the equal-draws assertion below sharper than it was -- it used to be a
 * count of dealing plus picking, and it is now a count of picking.
 */
function draft(pod: PodPolicy, seed: number) {
  let draws = 0;
  // The same stream replayDraft gives the bots, or this helper and a replay
  // of its own output are two different drafts.
  const rng = botRng(seed);
  const counted = () => {
    draws++;
    return rng();
  };

  const engine = new DraftEngine(dealDraft(fakeSet(), seed), counted, pod);
  const picked: string[] = [];
  while (!engine.isComplete()) {
    const best = [...engine.currentPack].sort((a, b) => cardValue(b) - cardValue(a))[0];
    picked.push(best.name);
    engine.humanPick(best);
  }
  return { draws, picked };
}

describe("a pod policy", () => {
  it("draws exactly as many random numbers as the legacy pod", () => {
    for (const seed of [1, 2, 3, 17, 99]) {
      expect(draft("table", seed).draws).toBe(draft("legacy", seed).draws);
      expect(draft("sharks", seed).draws).toBe(draft("legacy", seed).draws);
    }
  });

  it("deals a different draft, which is what it is for", () => {
    // If this ever passes by accident the test above is measuring nothing, so
    // the two belong together.
    const legacy = draft("legacy", 42).picked;
    const table = draft("table", 42).picked;

    expect(table).not.toEqual(legacy);
  });

  it("is deterministic, so a stored draft still replays", () => {
    expect(draft("table", 42).picked).toEqual(draft("table", 42).picked);
  });

  it("replays exactly under the pod it was dealt with", () => {
    const { picked } = draft("table", 7);
    const engine = replayDraft(dealDraft(fakeSet(), 7), 7, picked, undefined, "table");

    expect(engine.history.map((h) => h.picked.name)).toEqual(picked);
  });

  // The failure this exists to make loud. Replaying under the wrong pod deals
  // different packs, and the alternative to throwing is a draft that silently
  // rebuilds as somebody else's.
  it("refuses to replay under a different pod", () => {
    const { picked } = draft("table", 7);

    expect(() => replayDraft(dealDraft(fakeSet(), 7), 7, picked, undefined, "legacy")).toThrow(/diverged/);
  });

  it("defaults to legacy, so every caller written before pods still deals the same", () => {
    const explicit = draft("legacy", 5).picked;

    const engine = new DraftEngine(dealDraft(fakeSet(), 5), botRng(5));
    const implicit: string[] = [];
    while (!engine.isComplete()) {
      const best = [...engine.currentPack].sort((a, b) => cardValue(b) - cardValue(a))[0];
      implicit.push(best.name);
      engine.humanPick(best);
    }

    expect(implicit).toEqual(explicit);
  });
});
