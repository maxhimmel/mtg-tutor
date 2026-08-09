// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { challengeInvite, challengeParty } from "../convex/sessions.js";
import type { Id } from "../convex/_generated/dataModel.js";

// The two gates that let one person read another person's draft -- the only
// exception to ownedSession in the app. Every assertion here is a NEGATIVE one
// except where noted, because what can be wrong about a cross-user read is who
// it lets through, and a test that only proves the happy path proves the half
// that was never in doubt.
//
// `t.run` gives a real ctx, so these exercise the helpers as they are called
// rather than a re-description of them.

const ISS = "https://example.workos.com";
const token = (subject: string) => `${ISS}|${subject}`;

// `tokenIdentifier` spelled out rather than left to the harness to invent,
// because it is the thing under test: `draftSessions.userId` and
// `challenges.challengerUserId` hold the token identifier, NOT the subject, and
// a gate compared against the wrong one of those would refuse everybody or
// admit anybody depending on which way it was wrong.
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS });

async function seed(t: ReturnType<typeof harness>, over: Record<string, unknown> = {}) {
  return await t.run(async (ctx) => {
    const mine = await ctx.db.insert("draftSessions", {
      userId: token("alice"),
      setCode: "fdn",
      format: "TradDraft",
      seed: 42,
      pickedNames: [],
      status: "complete" as const,
      createdAt: new Date(0).toISOString(),
    });
    const challengeId = await ctx.db.insert("challenges", {
      challengerUserId: token("alice"),
      challengerSubject: "alice",
      challengerSessionId: mine,
      setCode: "fdn",
      format: "TradDraft",
      seed: 42,
      createdAt: new Date(0).toISOString(),
      ...over,
    });
    return { challengeId, mine };
  });
}

describe("challengeInvite", () => {
  it("lets a signed-in stranger read the offer -- that is what a link is", async () => {
    const t = harness();
    const { challengeId } = await seed(t);

    const got = await as(t, "bob")
      .run(async (ctx) => challengeInvite(ctx, challengeId));

    expect(got.seed).toBe(42);
  });

  it("refuses a signed-out caller", async () => {
    const t = harness();
    const { challengeId } = await seed(t);

    await expect(t.run(async (ctx) => challengeInvite(ctx, challengeId))).rejects.toThrow(
      /signed in/,
    );
  });

  it("returns a revoked challenge rather than pretending it never existed", async () => {
    const t = harness();
    const { challengeId } = await seed(t, { revokedAt: new Date(0).toISOString() });

    const got = await as(t, "bob")
      .run(async (ctx) => challengeInvite(ctx, challengeId));

    // The landing page has to tell them it was withdrawn, which it cannot do if
    // the gate has already thrown "not a challenge" at it.
    expect(got.revokedAt).toBeDefined();
  });
});

describe("challengeParty", () => {
  it("admits the challenger, and says which side they are", async () => {
    const t = harness();
    const { challengeId } = await seed(t);

    const got = await as(t, "alice")
      .run(async (ctx) => challengeParty(ctx, challengeId));

    expect(got.side).toBe("challenger");
  });

  it("admits the friend once they have accepted", async () => {
    const t = harness();
    const { challengeId } = await seed(t, { friendUserId: token("bob"), friendSubject: "bob" });

    const got = await as(t, "bob")
      .run(async (ctx) => challengeParty(ctx, challengeId));

    expect(got.side).toBe("friend");
  });

  it("refuses a third party holding a real challenge id", async () => {
    const t = harness();
    const { challengeId } = await seed(t, { friendUserId: token("bob"), friendSubject: "bob" });

    await expect(
      as(t, "mallory").run(async (ctx) => challengeParty(ctx, challengeId)),
    ).rejects.toThrow(/not yours to read/);
  });

  it("refuses the invitee BEFORE they accept", async () => {
    // The gap challengeInvite exists to cover. If this ever passes, the diff is
    // readable by anyone holding a link, before either draft is finished.
    const t = harness();
    const { challengeId } = await seed(t);

    await expect(
      as(t, "bob").run(async (ctx) => challengeParty(ctx, challengeId)),
    ).rejects.toThrow(/not yours to read/);
  });

  it("says the same thing about a challenge that does not exist", async () => {
    const t = harness();
    const { challengeId } = await seed(t);
    const real = await as(t, "mallory")
      .run(async (ctx) => challengeParty(ctx, challengeId).catch((e: Error) => e.message));
    const fake = await as(t, "mallory")
      .run(async (ctx) =>
        challengeParty(ctx, "kg21abcdefghijklmnopqrstuvwx" as Id<"challenges">).catch(
          (e: Error) => e.message,
        ),
      );

    // Differing here would answer "does this challenge exist" to anyone who
    // asked. Nothing needs that answered, so nothing answers it.
    expect(fake).toBe(real);
  });
});
