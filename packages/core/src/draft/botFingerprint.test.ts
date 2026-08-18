import { describe, expect, it } from "vitest";
import { BOT_FINGERPRINT, FITTED_POLICIES, POLICY_FEATURES } from "./policy.js";

// The other test that is supposed to fail when you change something on purpose.
//
// A pod policy is frozen the moment a session records it. Bots decide what
// wheels, so re-fitting `table` in place re-deals every draft that stored
// `table` and strands the lot -- and unlike a card-data change there is nothing
// to notice it: `sourceHash` would not move, `review.list` would badge nothing,
// and the drafts would simply stop opening.
//
// This is the announcement. `VALUE_FINGERPRINT` is the same idea one layer down,
// and the difference between them is the point: that one FEEDS POOL_REVISION so
// a formula change forces a re-ingest. This one deliberately does not. A new pod
// changes no card, so a re-ingest would be work for nothing and would badge
// every existing draft stale when not one of them has moved.
describe("the fitted pods' fingerprint", () => {
  it("has not moved", () => {
    expect(
      BOT_FINGERPRINT,
      [
        "",
        "A fitted pod's weights or feature order have changed.",
        "",
        "If you re-fitted an EXISTING pod in place, stop: every draft that",
        "stored that pod name replays against these weights, and different",
        "weights deal different packs. Those drafts are not repairable.",
        "",
        "The safe change is a NEW pod name, leaving the existing ones alone:",
        "  1. add it to PodPolicy and FITTED_POLICIES",
        "  2. add it to draftSessions.pod in the schema",
        "  3. update the fingerprint below",
        "",
        "Deliberately NOT in POOL_REVISION: no card data changed, so nothing",
        "needs re-ingesting and no existing draft should be badged stale.",
        "",
      ].join("\n"),
    ).toBe("1y55bb7");
  });

  // Guards the guard. A fingerprint that cannot notice the two changes it exists
  // to catch reads as coverage and is worse than nothing -- measurement trap #4.
  it("notices a changed weight and a reordered feature list", () => {
    const fingerprint = (features: readonly string[], policies: Record<string, readonly number[]>) => {
      let h = 0x811c9dc5;
      const eat = (s: string) => {
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
      };
      eat(features.join(","));
      for (const name of Object.keys(policies).sort()) {
        eat(name);
        for (const w of policies[name]) eat(w.toFixed(6));
      }
      return h.toString(36);
    };

    const asShipped = fingerprint(POLICY_FEATURES, FITTED_POLICIES);
    expect(asShipped).toBe(BOT_FINGERPRINT);

    // A weight nudged in the sixth decimal, which is the smallest thing that
    // could re-deal a draft.
    const nudged = {
      ...FITTED_POLICIES,
      table: [...FITTED_POLICIES.table.slice(0, -1), FITTED_POLICIES.table.at(-1)! + 0.000001],
    };
    expect(fingerprint(POLICY_FEATURES, nudged)).not.toBe(asShipped);

    // And the failure a weights-only hash would miss entirely: the vector is
    // POSITIONAL, so swapping two feature names repoints every coefficient at a
    // different feature without changing a single number.
    const swapped = [POLICY_FEATURES[1], POLICY_FEATURES[0], ...POLICY_FEATURES.slice(2)];
    expect(fingerprint(swapped, FITTED_POLICIES)).not.toBe(asShipped);
  });
});
