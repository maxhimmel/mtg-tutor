// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";

import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { buildSetData, dealDraft, packDeal } from "@mtg-tutor/core";

/**
 * A session and the boosters it was dealt, which is what `startSession` writes.
 *
 * Hand-inserting a session row is no longer enough: a draft carries its own
 * packs now, and `dealFor` refuses a session without them rather than dealing
 * fresh ones -- see draftPools.ts for why that refusal is deliberate.
 */
async function insertSession(
  ctx: any,
  cards: any[],
  row: any,
): Promise<any> {
  const sessionId = await ctx.db.insert("draftSessions", row);
  await ctx.db.insert("draftPools", {
    sessionId,
    ...packDeal(dealDraft(buildSetData(row.setCode, cards, [], undefined), row.seed)),
    colorWinRates: [],
  });
  return sessionId;
}


// Proves the harness itself before anything depends on it: that two identities
// are really two people, and that ownedSession refuses across them. Every
// authorization test for the challenge feature is this shape, so if this file
// is wrong they are all wrong in the same direction -- silently passing.
//
// edge-runtime per file rather than a vitest config, because it is only these
// tests that need it and the other four suites are plain Node.
describe("convex-test harness", () => {
  it("gives two identities two different tokenIdentifiers", async () => {
    const t = harness();
    const alice = t.withIdentity({ subject: "user_alice" });
    const bob = t.withIdentity({ subject: "user_bob" });

    const mine = await alice.query(api.quota.mine, {});
    const theirs = await bob.query(api.quota.mine, {});

    expect(mine?.subject).toBe("user_alice");
    expect(theirs?.subject).toBe("user_bob");
  });

  it("answers null to a signed-out caller rather than throwing", async () => {
    const t = harness();
    expect(await t.query(api.quota.mine, {})).toBeNull();
  });

  it("refuses one person's session to another", async () => {
    const t = harness();

    // Inserted directly: draft.start would spend a quota token and need an
    // ingested set, and neither is what this assertion is about.
    const sessionId = await t.run(async (ctx) =>
      insertSession(ctx, [], {
        userId: "https://example.workos.com|user_alice",
        setCode: "fdn",
        format: "PremierDraft",
        seed: 42,
        pickedNames: [],
        status: "active" as const,
        createdAt: new Date(0).toISOString(),
      }),
    );

    const bob = t.withIdentity({ subject: "user_bob" });

    // On the sentence, not merely on ConvexError: no set is ingested in this
    // harness, so `replayFor` would also throw one and the test would pass
    // while proving nothing about ownership. ownedSession runs first, and this
    // asserts that it is what refused.
    await expect(
      bob.query(api.draft.state, { sessionId: sessionId as Id<"draftSessions"> }),
    ).rejects.toThrow(/does not belong to you/);
  });
});
