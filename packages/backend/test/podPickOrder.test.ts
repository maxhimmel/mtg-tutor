// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";
import { DEFAULT_POD, POD_READS_PICK_ORDER } from "@mtg-tutor/core";

// The refusal that stops a new pod dealing from the old ranking.
//
// `policyFeatures` falls back to `value` when `tableValue` is absent, which it
// has to: a draft dealt before the column existed replays against the pool it
// carries, and that pool has none. The same fallback on a NEW draft is the
// dangerous case -- the row would say `table3`, every pack would come off the
// win-rate ranking `table3` exists to stop using, and it would replay perfectly
// forever. Nothing looks broken; the packs are just the old bad packs.
//
// The window is a deploy: the code carries the new pods before `ingest-sets` has
// given the pools their column. This is what makes that window loud.

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS, role: "tester" });

const SET = { code: "tst", format: "TradDraft" };
const START = { setCode: SET.code, format: SET.format };

function pool(withTableValue: boolean) {
  return Array.from({ length: 120 }, (_, i) => ({
    name: `C${i}`,
    colors: ["W" as const],
    slot: "common" as const,
    turn: 2,
    role: "creature" as const,
    value: 0.5 + (i % 10) / 100,
    ...(withTableValue ? { tableValue: 0.5 + ((i * 7) % 10) / 100 } : {}),
  }));
}

async function seedSet(t: ReturnType<typeof harness>, withTableValue: boolean) {
  await t.run(async (ctx) => {
    await ctx.db.insert("sets", {
      code: SET.code,
      name: "Test Set",
      format: SET.format,
      cardCount: 120,
      ratedCardCount: 120,
      ingestedAt: new Date(0).toISOString(),
    });
    await ctx.db.insert("setCards", {
      code: SET.code,
      format: SET.format,
      cards: pool(withTableValue),
      colorWinRates: [],
    });
  });
}

describe("a pod that picks by pick order", () => {
  it("is exactly the pods whose weights actually read those columns", () => {
    // Derived from the weight vectors, so this is checking the derivation rather
    // than restating a list. `table2` must NOT be in it -- its vector is eight
    // long and stops before the two columns -- or the guard would refuse to deal
    // a pod that never wanted them.
    expect([...POD_READS_PICK_ORDER].sort()).toEqual(["sharks3", "table3"]);
    expect(POD_READS_PICK_ORDER.has(DEFAULT_POD)).toBe(true);
  });

  it("refuses to be dealt a pool that has no pick order, naming the fix", async () => {
    const t = harness();
    await seedSet(t, false);

    await expect(
      as(t, "alice").mutation(api.draft.start, { ...START, pod: "table3" }),
    ).rejects.toThrow(/pnpm ingest-sets tst/);
  });

  it("deals normally once the pool has been ingested with one", async () => {
    const t = harness();
    await seedSet(t, true);

    const sessionId = await as(t, "alice").mutation(api.draft.start, { ...START, pod: "table3" });
    const state = await as(t, "alice").query(api.draft.state, { sessionId });
    expect(state.pack.length).toBeGreaterThan(0);
  });

  // The control for the guard's SCOPE is the derivation test above: `table2` is
  // not in the set, so `requireTableValue` returns before it looks at a card. A
  // behavioural control cannot go through `draft.start` at all, and the reason
  // is worth an assertion of its own.
  it("cannot be asked for a superseded pod in the first place", async () => {
    const t = harness();
    await seedSet(t, true);

    // `draft.start`'s union is the OFFERED pods, deliberately narrower than the
    // schema's -- which stays wide because `challenges.accept` deals a friend
    // whatever pod the challenger recorded, superseded or not.
    await expect(
      // @ts-expect-error -- the point: a pod nobody may choose is a type error
      // here as well as a validator error, and both are the same rule.
      as(t, "alice").mutation(api.draft.start, { ...START, pod: "table2" }),
    ).rejects.toThrow();
  });
});
