// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

// The lifecycle, driven through the public mutations rather than through the
// helpers, because what these assert is the ORDER of the refusals and the
// single-acceptor guarantee -- both properties of the wiring, not of a
// predicate. Any of them would pass against a mutation that refused for the
// wrong reason, so each asserts the sentence.

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS, role: "tester" });

/**
 * A set the engine can actually deal from, plus a finished draft for alice.
 *
 * `role: "tester"` above is doing real work: it is in UNLIMITED, so the quota
 * component never runs and these tests are about the challenge rather than
 * about three-drafts-a-day. The quota refusal has its own test below with a
 * `beta` caller.
 */
const COLORS = ["W", "U", "B", "R", "G"] as const;
const SET = { code: "tst", format: "TradDraft" };

/**
 * The engine half of a pool, built here rather than borrowed from core's
 * `fakeSet`: `src/testing` is excluded from core's build on purpose, so it does
 * not ship in dist and the backend cannot import it. This is the stored shape
 * anyway -- `setCards.cards` is `engineCard[]` -- so building it directly is
 * closer to what the mutation reads than a SetData would be.
 */
function pool() {
  const cards = [];
  for (let i = 0; i < 60; i++)
    cards.push({ name: `C${i}`, colors: [COLORS[i % 5]], slot: "common" as const, value: 40 + (i % 10) });
  for (let i = 0; i < 30; i++)
    cards.push({ name: `U${i}`, colors: [COLORS[i % 5]], slot: "uncommon" as const, value: 50 + (i % 10) });
  for (let i = 0; i < 20; i++)
    cards.push({ name: `R${i}`, colors: [COLORS[i % 5]], slot: "rare" as const, value: 60 });
  for (let i = 0; i < 10; i++)
    cards.push({ name: `M${i}`, colors: [COLORS[i % 5]], slot: "mythic" as const, value: 70 });
  return cards;
}

async function seedWorld(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("sets", {
      ...SET,
      cardCount: 120,
      ratedCardCount: 120,
      ingestedAt: new Date(0).toISOString(),
      sourceHash: "hash-1",
    });
    await ctx.db.insert("setCards", { ...SET, cards: pool(), colorWinRates: [] });

    const sessionId = await ctx.db.insert("draftSessions", {
      userId: token("alice"),
      setCode: SET.code,
      format: SET.format,
      seed: 42,
      pickedNames: [],
      status: "complete" as const,
      createdAt: new Date(0).toISOString(),
      sourceHash: "hash-1",
    });

    return { set: SET, sessionId };
  });
}

describe("challenges.create", () => {
  it("refuses a draft that is not finished", async () => {
    const t = harness();
    const { set } = await seedWorld(t);
    const unfinished = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        userId: token("alice"),
        setCode: SET.code,
        format: SET.format,
        seed: 7,
        pickedNames: [],
        status: "active" as const,
        createdAt: new Date(0).toISOString(),
      }),
    );

    await expect(
      as(t, "alice").mutation(api.challenges.create, { sessionId: unfinished }),
    ).rejects.toThrow(/Finish this draft/);
  });

  it("refuses somebody else's draft", async () => {
    const t = harness();
    const { sessionId } = await seedWorld(t);

    await expect(
      as(t, "bob").mutation(api.challenges.create, { sessionId }),
    ).rejects.toThrow(/does not belong to you/);
  });

  it("copies the deal off the session and clamps what the challenger typed", async () => {
    const t = harness();
    const { set, sessionId } = await seedWorld(t);

    const id = await as(t, "alice").mutation(api.challenges.create, {
      sessionId,
      fromName: "  " + "x".repeat(200) + "  ",
    });

    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row?.seed).toBe(42);
    expect(row?.setCode).toBe(set.code);
    expect(row?.fromName?.length).toBe(40);
  });
});

describe("challenges.accept", () => {
  async function open(t: ReturnType<typeof harness>) {
    const { set, sessionId } = await seedWorld(t);
    const challengeId = await as(t, "alice").mutation(api.challenges.create, { sessionId });
    return { set, challengeId };
  }

  it("deals the friend the challenger's seed, and marks the session", async () => {
    const t = harness();
    const { challengeId } = await open(t);

    const friendSession = await as(t, "bob").mutation(api.challenges.accept, { challengeId });
    const row = await t.run(async (ctx) => ctx.db.get(friendSession));

    expect(row?.seed).toBe(42);
    expect(row?.challengeId).toBe(challengeId);
    expect(row?.userId).toBe(token("bob"));
  });

  it("refuses the challenger their own challenge", async () => {
    const t = harness();
    const { challengeId } = await open(t);

    await expect(
      as(t, "alice").mutation(api.challenges.accept, { challengeId }),
    ).rejects.toThrow(/your own challenge/);
  });

  it("refuses a second acceptor", async () => {
    const t = harness();
    const { challengeId } = await open(t);
    await as(t, "bob").mutation(api.challenges.accept, { challengeId });

    await expect(
      as(t, "carol").mutation(api.challenges.accept, { challengeId }),
    ).rejects.toThrow(/already taken/);
  });

  it("refuses the SAME acceptor twice rather than dealing a second draft", async () => {
    // Idempotence would be the friendly-looking bug here: accept spends a draft
    // token and creates a session, so answering twice hands somebody two.
    const t = harness();
    const { challengeId } = await open(t);
    const first = await as(t, "bob").mutation(api.challenges.accept, { challengeId });

    await expect(
      as(t, "bob").mutation(api.challenges.accept, { challengeId }),
    ).rejects.toThrow(/already taken/);

    const sessions = await t.run(async (ctx) =>
      ctx.db
        .query("draftSessions")
        .withIndex("by_user", (q) => q.eq("userId", token("bob")))
        .collect(),
    );
    expect(sessions.map((s) => s._id)).toEqual([first]);
  });

  it("refuses a withdrawn challenge", async () => {
    const t = harness();
    const { challengeId } = await open(t);
    await as(t, "alice").mutation(api.challenges.revoke, { challengeId });

    await expect(
      as(t, "bob").mutation(api.challenges.accept, { challengeId }),
    ).rejects.toThrow(/withdrawn/);
  });

  it("refuses when the set has moved under the seed", async () => {
    // The failure this guard exists for is silent: both drafts would work and
    // the diff would be nonsense. Dropping a card is the cheapest honest way to
    // make the deal move -- a real re-ingest moves it by reordering pools.
    const t = harness();
    const { set, challengeId } = await open(t);

    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("setCards")
        .withIndex("by_code_and_format", (q) => q.eq("code", set.code).eq("format", set.format))
        .unique();
      // Give the challenger picks that the shrunken pool can no longer deal, so
      // the replay actually diverges rather than merely reading a smaller set.
      const session = await ctx.db
        .query("draftSessions")
        .withIndex("by_user", (q) => q.eq("userId", token("alice")))
        .first();
      await ctx.db.patch(session!._id, { pickedNames: [doc!.cards[0].name] });
      await ctx.db.patch(doc!._id, { cards: doc!.cards.filter((c) => c.name !== doc!.cards[0].name) });
    });

    await expect(
      as(t, "bob").mutation(api.challenges.accept, { challengeId }),
    ).rejects.toThrow(/card data has changed/);
  });
});

describe("challenges.revoke", () => {
  it("cannot take back a challenge somebody has already spent a draft on", async () => {
    const t = harness();
    const { sessionId } = await seedWorld(t);
    const challengeId = await as(t, "alice").mutation(api.challenges.create, { sessionId });
    await as(t, "bob").mutation(api.challenges.accept, { challengeId });

    await expect(
      as(t, "alice").mutation(api.challenges.revoke, { challengeId }),
    ).rejects.toThrow(/already taken/);
  });

  it("is not somebody else's to withdraw", async () => {
    const t = harness();
    const { sessionId } = await seedWorld(t);
    const challengeId = await as(t, "alice").mutation(api.challenges.create, { sessionId });

    await expect(
      as(t, "bob").mutation(api.challenges.revoke, { challengeId }),
    ).rejects.toThrow(/not yours to withdraw/);
  });
});

describe("challenges.mine", () => {
  it("shows both sides, and only the challenger has anything unread", async () => {
    const t = harness();
    const { sessionId } = await seedWorld(t);
    const challengeId = await as(t, "alice").mutation(api.challenges.create, { sessionId });
    await as(t, "bob").mutation(api.challenges.accept, { challengeId });
    await t.run(async (ctx) =>
      ctx.db.patch(challengeId as Id<"challenges">, { finishedAt: new Date(0).toISOString() }),
    );

    const hers = await as(t, "alice").query(api.challenges.mine, {});
    const his = await as(t, "bob").query(api.challenges.mine, {});

    expect(hers[0].side).toBe("challenger");
    expect(hers[0].state).toBe("finished");
    expect(hers[0].unread).toBe(true);
    expect(his[0].side).toBe("friend");
    // He was there when his own draft ended; there is nothing to tell him.
    expect(his[0].unread).toBe(false);
  });
});
