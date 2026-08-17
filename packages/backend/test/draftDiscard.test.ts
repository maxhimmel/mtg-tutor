// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { buildSetData, dealDraft, packDeal } from "@mtg-tutor/core";

// What `unfinished` offers and what `discard` takes away.
//
// The delete is the only thing in the app that destroys a person's own data, so
// what is asserted here is the FULL extent of it: every table that names the
// session, checked as gone, and the two that name it and are deliberately kept,
// checked as still there. A test that only asserted the session row would pass
// against a mutation that orphaned five tables.

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS, role: "tester" });

const SET = { code: "tst", format: "TradDraft" };
const SHAPE = { turn: 2, role: "creature" as const };
const CARD = { name: "C0", colors: ["W" as const], slot: "common" as const, value: 40 };

function pool() {
  return Array.from({ length: 120 }, (_, i) => ({
    name: `C${i}`,
    colors: ["W" as const],
    slot: "common" as const,
    value: 40,
    ...SHAPE,
  }));
}

/** A session with every kind of row that points at one already written to it. */
async function seedDraft(
  t: ReturnType<typeof harness>,
  row: Record<string, unknown> = {},
): Promise<Id<"draftSessions">> {
  return await t.run(async (ctx) => {
    const session = {
      userId: token("alice"),
      setCode: SET.code,
      format: SET.format,
      seed: 42,
      pickedNames: ["C0"],
      status: "active" as const,
      createdAt: new Date(0).toISOString(),
      ...row,
    };
    const sessionId = await ctx.db.insert("draftSessions", session);

    await ctx.db.insert("draftPools", {
      sessionId,
      ...packDeal(dealDraft(buildSetData(SET.code, pool(), [], undefined), 42)),
      colorWinRates: [],
    });
    await ctx.db.insert("draftPicks", {
      sessionId,
      pickIndex: 0,
      packNo: 1,
      pickNo: 1,
      pack: [CARD],
      pickedName: "C0",
      poolBefore: [],
      score: {
        score: 5,
        grade: "B",
        pickedName: "C0",
        pickedValue: 40,
        rawBestName: "C0",
        rawBestValue: 40,
        contextBestName: "C0",
        contextBestValue: 40,
        isBest: true,
        onColor: true,
        rankInPack: 1,
      },
    });
    await ctx.db.insert("draftDigests", {
      sessionId,
      picks: { scores: [5], packNos: [1], pickNos: [1] },
      mistakes: [],
    });
    await ctx.db.insert("reviewVerdicts", {
      sessionId,
      pickIndex: 0,
      verdict: { contextBestName: "C0", divergenceLesson: "—", narrative: "—" },
    });
    await ctx.db.insert("reviewFrames", { sessionId, phase: "open" as const, text: "—" });
    await ctx.db.insert("llmUsage", {
      sessionId,
      area: "coach",
      provider: "test",
      model: "test",
      inputTokens: 1,
      outputTokens: 1,
      finishReason: "stop",
      ms: 1,
      userId: token("alice"),
      createdAt: new Date(0).toISOString(),
    });

    return sessionId;
  });
}

const counts = async (t: ReturnType<typeof harness>) =>
  await t.run(async (ctx) => ({
    draftSessions: (await ctx.db.query("draftSessions").collect()).length,
    draftPools: (await ctx.db.query("draftPools").collect()).length,
    draftPicks: (await ctx.db.query("draftPicks").collect()).length,
    draftDigests: (await ctx.db.query("draftDigests").collect()).length,
    reviewVerdicts: (await ctx.db.query("reviewVerdicts").collect()).length,
    reviewFrames: (await ctx.db.query("reviewFrames").collect()).length,
    llmUsage: (await ctx.db.query("llmUsage").collect()).length,
  }));

describe("draft.unfinished", () => {
  it("offers the active drafts and not the finished ones", async () => {
    const t = harness();
    await seedDraft(t);
    await seedDraft(t, { seed: 7, status: "complete" as const });

    const open = await as(t, "alice").query(api.draft.unfinished, {});
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ setCode: SET.code, picks: 1, promised: false });
  });

  it("shows nobody else's", async () => {
    const t = harness();
    await seedDraft(t);

    expect(await as(t, "bob").query(api.draft.unfinished, {})).toEqual([]);
  });

  // Both sides, because they are found two different ways -- the friend's
  // session names its challenge, and the challenger's is named by one.
  it("marks a draft a challenge names, from either side of it", async () => {
    const t = harness();
    const mine = await seedDraft(t);
    const theirs = await seedDraft(t, { userId: token("bob"), seed: 7 });

    await t.run(async (ctx) => {
      await ctx.db.insert("challenges", {
        challengerUserId: token("alice"),
        challengerSubject: "alice",
        challengerSessionId: mine,
        setCode: SET.code,
        format: SET.format,
        seed: 42,
        createdAt: new Date(0).toISOString(),
      });
      await ctx.db.patch(theirs, {
        challengeId: await ctx.db.insert("challenges", {
          challengerUserId: token("carol"),
          challengerSubject: "carol",
          challengerSessionId: mine,
          setCode: SET.code,
          format: SET.format,
          seed: 7,
          createdAt: new Date(0).toISOString(),
        }),
      });
    });

    const alice = await as(t, "alice").query(api.draft.unfinished, {});
    expect(alice.map((d) => d.promised)).toEqual([true]);

    const bob = await as(t, "bob").query(api.draft.unfinished, {});
    expect(bob.map((d) => d.promised)).toEqual([true]);
  });
});

describe("draft.discard", () => {
  it("takes every row that pointed at the draft, and leaves llmUsage standing", async () => {
    const t = harness();
    const sessionId = await seedDraft(t);

    await as(t, "alice").mutation(api.draft.discard, { sessionId });

    expect(await counts(t)).toEqual({
      draftSessions: 0,
      draftPools: 0,
      draftPicks: 0,
      draftDigests: 0,
      reviewVerdicts: 0,
      reviewFrames: 0,
      // Kept: it records that the deployment's key was spent, which stays true
      // after the draft it was spent on is gone. Same call `reset.wipeDrafts`
      // makes.
      llmUsage: 1,
    });
  });

  it("refuses somebody else's draft", async () => {
    const t = harness();
    const sessionId = await seedDraft(t);

    await expect(
      as(t, "bob").mutation(api.draft.discard, { sessionId }),
    ).rejects.toThrow(/does not belong to you/);
    expect((await counts(t)).draftSessions).toBe(1);
  });

  it("refuses the challenger's draft, which a challenge points at", async () => {
    const t = harness();
    const sessionId = await seedDraft(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("challenges", {
        challengerUserId: token("alice"),
        challengerSubject: "alice",
        challengerSessionId: sessionId,
        setCode: SET.code,
        format: SET.format,
        seed: 42,
        createdAt: new Date(0).toISOString(),
      });
    });

    await expect(
      as(t, "alice").mutation(api.draft.discard, { sessionId }),
    ).rejects.toThrow(/part of a challenge/);
    expect((await counts(t)).draftSessions).toBe(1);
  });

  it("refuses the friend's draft, which names the challenge itself", async () => {
    const t = harness();
    const sessionId = await seedDraft(t);
    await t.run(async (ctx) => {
      const challengeId = await ctx.db.insert("challenges", {
        challengerUserId: token("carol"),
        challengerSubject: "carol",
        challengerSessionId: sessionId,
        setCode: SET.code,
        format: SET.format,
        seed: 42,
        createdAt: new Date(0).toISOString(),
      });
      await ctx.db.patch(sessionId, { challengeId });
    });

    await expect(
      as(t, "alice").mutation(api.draft.discard, { sessionId }),
    ).rejects.toThrow(/part of a challenge/);
    expect((await counts(t)).draftSessions).toBe(1);
  });
});
