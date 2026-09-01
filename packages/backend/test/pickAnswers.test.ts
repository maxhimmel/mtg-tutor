// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";

/**
 * The store under the progression readout, and the one distinction it has to
 * get right.
 *
 * A repeat and a retry look identical on the wire: the most ordinary way to be
 * asked a pack twice is to answer it the same way twice. The first version of
 * this table inferred the difference from the card and refused any row naming
 * the card the last one named -- so standing by an answer was unwritable,
 * `missProgress`'s `heldOn` could never leave zero, and the fixed tier re-dealt
 * one pack ahead of its own tier forever because `at` never moved.
 *
 * None of that was visible in core's tests, which fold synthetic rows the store
 * could not produce. It is only visible here, which is why these are here.
 */

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS, role: "tester" });

const PICKS = ["Alpha", "Beta", "Gamma", "Delta"];

/** A finished draft, reduced to the one thing `record` reads off it: its length. */
async function session(t: ReturnType<typeof harness>, user: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("draftSessions", {
      userId: token(user),
      setCode: "tst",
      format: "TradDraft",
      seed: 42,
      pickedNames: PICKS,
      status: "complete" as const,
      createdAt: "2026-08-01",
    }),
  );
}

const rows = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => ctx.db.query("pickAnswers").collect());

describe("pickAnswers.record", () => {
  // The case the old guard got backwards, and the reason the column exists.
  it("writes a second row for the same card under a second attempt", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");
    const answer = {
      sessionId,
      pickIndex: 0,
      asked: "misses" as const,
      answered: "Beta",
      rawBestName: "Gamma",
      contextBestName: "Beta",
    };

    await as(t, "alice").mutation(api.pickAnswers.record, { ...answer, attemptId: "run-1:0" });
    await as(t, "alice").mutation(api.pickAnswers.record, { ...answer, attemptId: "run-2:0" });

    expect(await rows(t)).toHaveLength(2);
  });

  // The case it got right, for the reason it exists: a resent mutation, a
  // double-click, a client that mounted twice.
  it("writes once when the same attempt arrives twice", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");
    const answer = {
      sessionId,
      pickIndex: 0,
      asked: "misses" as const,
      answered: "Beta",
      rawBestName: "Gamma",
      contextBestName: "Beta",
      attemptId: "run-1:0",
    };

    const first = await as(t, "alice").mutation(api.pickAnswers.record, answer);
    const again = await as(t, "alice").mutation(api.pickAnswers.record, answer);

    expect(again).toBe(first);
    expect(await rows(t)).toHaveLength(1);
  });

  // The two surfaces grade the same pick by different rules, so they are two
  // records of two questions and neither may swallow the other -- even when a
  // client happens to reuse a sitting's id across both.
  it("keeps the two surfaces apart", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");
    const answer = {
      sessionId,
      pickIndex: 0,
      answered: "Beta",
      rawBestName: "Gamma",
      contextBestName: "Beta",
      attemptId: "sitting:0",
    };

    await as(t, "alice").mutation(api.pickAnswers.record, { ...answer, asked: "misses" });
    await as(t, "alice").mutation(api.pickAnswers.record, { ...answer, asked: "review" });

    expect((await rows(t)).map((r) => r.asked).sort()).toEqual(["misses", "review"]);
  });

  // A row from the day before the column existed. It is history, and history is
  // never a duplicate of something being answered now -- so it must not stand in
  // the way of the next write, which an `undefined === undefined` guard would.
  it("lets a row written before attempts were named stand aside", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");
    await t.run(async (ctx) => {
      await ctx.db.insert("pickAnswers", {
        userId: token("alice"),
        sessionId,
        pickIndex: 0,
        asked: "misses" as const,
        answered: "Beta",
        rawBestName: "Gamma",
        contextBestName: "Beta",
        at: "2026-08-31T19:00:44.539Z",
      });
    });

    await as(t, "alice").mutation(api.pickAnswers.record, {
      sessionId,
      pickIndex: 0,
      asked: "misses",
      answered: "Beta",
      rawBestName: "Gamma",
      contextBestName: "Beta",
      attemptId: "run-1:0",
    });

    expect(await rows(t)).toHaveLength(2);
  });

  it("refuses a pick the session does not have", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");

    await expect(
      as(t, "alice").mutation(api.pickAnswers.record, {
        sessionId,
        pickIndex: PICKS.length,
        asked: "misses",
        answered: "Beta",
        rawBestName: "Gamma",
        contextBestName: "Beta",
        attemptId: "run-1:4",
      }),
    ).rejects.toThrow(/no pick at index 4/);
  });

  // A client never says whose answer this is, so a session somebody else owns
  // is the whole of the check.
  it("never writes against somebody else's draft", async () => {
    const t = harness();
    const sessionId = await session(t, "bob");

    await expect(
      as(t, "alice").mutation(api.pickAnswers.record, {
        sessionId,
        pickIndex: 0,
        asked: "misses",
        answered: "Beta",
        rawBestName: "Gamma",
        contextBestName: "Beta",
        attemptId: "run-1:0",
      }),
    ).rejects.toThrow();

    expect(await rows(t)).toHaveLength(0);
  });
});

/**
 * The four-way split, driven through the store rather than folded over
 * hand-written rows.
 *
 * core's `missProgress` already proves the fold, and proved it against two
 * `fixed: true` attempts of one question -- a shape the store refused to write,
 * so the unit test passed while the panel printed a structural zero. This is the
 * same assertion with the store in the middle, which is the only place it could
 * have failed.
 */
describe("stats.progress", () => {
  const twice = async (
    t: ReturnType<typeof harness>,
    sessionId: Awaited<ReturnType<typeof session>>,
    pickIndex: number,
    right: string,
    first: string,
    second: string,
  ) => {
    for (const [run, answered] of [
      ["run-1", first],
      ["run-2", second],
    ] as const) {
      await as(t, "alice").mutation(api.pickAnswers.record, {
        sessionId,
        pickIndex,
        asked: "misses",
        answered,
        rawBestName: "Zeta",
        contextBestName: right,
        attemptId: `${run}:${pickIndex}`,
      });
    }
  };

  it("counts every way a repeat can go, including standing by an answer", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");

    await twice(t, sessionId, 0, "Alpha", "Delta", "Alpha"); // missed, then took it back
    await twice(t, sessionId, 1, "Beta", "Beta", "Beta"); // right, and right again
    await twice(t, sessionId, 2, "Gamma", "Gamma", "Delta"); // right, then let it go
    await twice(t, sessionId, 3, "Delta", "Alpha", "Alpha"); // the same wrong call twice

    const progress = await as(t, "alice").query(api.stats.progress, {});

    expect(progress).toMatchObject({
      asked: 4,
      askedAgain: 4,
      tookBack: 1,
      heldOn: 1,
      slipped: 1,
      stillWrong: 1,
      answers: 8,
      // Alpha and Beta stand answered; Gamma was let go and Delta never found.
      fixed: 2,
    });
    expect(progress.since).toBeDefined();
  });

  // The review's rows are stored and deliberately unread here: it grades
  // leniently, against a card the coach may name after the fact, and every
  // review is a different draft of a different set.
  it("counts the drill's answers and not the review's", async () => {
    const t = harness();
    const sessionId = await session(t, "alice");

    await as(t, "alice").mutation(api.pickAnswers.record, {
      sessionId,
      pickIndex: 0,
      asked: "review",
      answered: "Alpha",
      rawBestName: "Alpha",
      contextBestName: "Alpha",
      attemptId: "visit-1:0",
    });

    const progress = await as(t, "alice").query(api.stats.progress, {});
    expect(progress).toMatchObject({ asked: 0, answers: 0 });
    // Convex drops an undefined field rather than sending it, so this is
    // asserted on its own: `toMatchObject` would be comparing against a key
    // that is not there and would pass whatever the query did.
    expect(progress.since).toBeUndefined();
  });

  it("never counts somebody else's answers", async () => {
    const t = harness();
    const sessionId = await session(t, "bob");

    await as(t, "bob").mutation(api.pickAnswers.record, {
      sessionId,
      pickIndex: 0,
      asked: "misses",
      answered: "Alpha",
      rawBestName: "Alpha",
      contextBestName: "Alpha",
      attemptId: "run-1:0",
    });

    expect(await as(t, "alice").query(api.stats.progress, {})).toMatchObject({ asked: 0 });
  });
});
