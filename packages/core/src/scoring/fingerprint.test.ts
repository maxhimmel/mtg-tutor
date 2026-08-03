import { describe, expect, it } from "vitest";
import { VALUE_FINGERPRINT, computeCardValue } from "./value.js";

// The one test that is supposed to fail when you change something on purpose.
//
// `EngineCard.value` is settled at ingest, so a change to `computeCardValue`
// does not reach a stored pool until that pool is ingested again -- and nothing
// at runtime compares the two. Scoring would keep returning the old numbers,
// consistently and silently.
//
// Two things stop that. The fingerprint feeds POOL_REVISION, so a formula change
// invalidates every set and the next ingest rebuilds them. And this pins the
// fingerprint, so the change is announced at commit time rather than discovered.
describe("the value formula's fingerprint", () => {
  it("has not moved", () => {
    expect(
      VALUE_FINGERPRINT,
      [
        "",
        "computeCardValue now returns different numbers.",
        "",
        "If that was deliberate:",
        "  1. update the fingerprint below to the received value",
        "  2. run `pnpm ingest-sets` so stored pools carry the new values",
        "",
        "POOL_REVISION already includes this fingerprint, so every set's",
        "sourceHash has changed and step 2 will actually re-ingest. Until it",
        "runs, scoring reads the OLD values from the database -- the formula",
        "here and the numbers in Convex disagree.",
        "",
        "If it was NOT deliberate, something changed cardValue by accident:",
        "the formula, SCORING.minSampleForWinRate, or RARITY_BASELINE.",
        "",
      ].join("\n"),
    ).toBe("hj8qhs");
  });

  // Guards the guard: a fingerprint that cannot notice a change is worse than
  // none, because it reads as coverage.
  it("is sensitive to each branch it claims to cover", () => {
    const base = { rarity: "common", typeLine: "Creature" } as const;
    const distinct = new Set(
      [
        computeCardValue({ ...base, gihWinRate: 0.55, gihGames: 5000, alsa: 8 }),
        computeCardValue({ ...base, gihWinRate: 0.55, gihGames: 40, alsa: 8 }),
        computeCardValue({ ...base, gihGames: 0, alsa: 8 }),
        computeCardValue({ ...base, gihGames: 0, alsa: 1 }),
        computeCardValue({ ...base, gihGames: 0, alsa: 8, rarityBaseline: 0.6123 }),
      ].map((v) => v.toFixed(12)),
    );
    // Trusted, blend, baseline, ALSA nudge, measured baseline -- five inputs
    // that must not collapse onto one another.
    expect(distinct.size).toBe(5);

    // And the rule that has nothing to do with any of them.
    expect(computeCardValue({ ...base, typeLine: "Basic Land — Island" })).toBe(0);
  });
});
