import { ConvexError, v } from "convex/values";
import { DraftEngine, cardValue, mulberry32, splitPool, summarizeDraft } from "@mtg-tutor/core";
import type { EngineCard, SetData } from "@mtg-tutor/core";
import { internalMutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { recordPick, storedScores } from "./draftPicks.js";
import { toSetData } from "./setData.js";

// DEV FIXTURES FOR THE CHALLENGE FEATURE. Nothing here ships a user anything.
//
// The feature needs two people, and a private beta of one developer has one.
// Inviting a second WorkOS account works and is the faithful test, but it costs
// that account a draft a day and forty-two clicks per run -- which is a bad loop
// to be in while moving a panel three pixels.
//
// So this manufactures whichever half you are not playing.
//
// EVERY FUNCTION HERE IS `internalMutation`, which means there is no public
// surface at all: they are reachable from `npx convex run` and the dashboard,
// both of which already require deployment admin credentials, and from nothing
// else. That is deliberate and is the whole security argument -- these fabricate
// sessions and stamp challenges finished, which is not something a signed-in
// caller should ever be able to ask for, however well guarded.
//
// Fixture rows are owned by a userId nobody can authenticate as, so they are
// invisible to every normal query and `wipe` can find them again. Draft data is
// disposable; nothing here is worth migrating.

const FIXTURE = "fixture|";
const challengerId = () => `${FIXTURE}challenger`;
const friendId = () => `${FIXTURE}friend`;

async function setFor(ctx: MutationCtx, setCode: string, format: string): Promise<SetData> {
  const cardsDoc = await ctx.db
    .query("setCards")
    .withIndex("by_code_and_format", (q) => q.eq("code", setCode).eq("format", format))
    .unique();

  if (!cardsDoc) {
    throw new ConvexError(
      `No card pool for ${setCode}/${format}. Ingest it first: ` +
        `npx convex run sets:ingest '{"setCode":"${setCode}"}'`,
    );
  }
  return toSetData(cardsDoc);
}

/**
 * Drive a whole draft and write the rows a real one would have written.
 *
 * `sloppiness` is what makes the fixture worth having. A bot that always takes
 * the best card produces two drafts that agree on every pick and a diff with
 * nothing in it -- no forks, no off-shelf callout, an empty braid. Worse, two
 * HONEST drafts often do the same: 339 of 1000 seed/divergence combinations
 * never come apart at all. So the fixture drafter takes the second- or
 * third-best card some of the time, which is what a person does and what makes
 * the screen have something to draw.
 *
 * Deterministic in the seed, so a fixture you are looking at stays the one you
 * were looking at when you reload.
 *
 * Scores here are RAW POWER, not context-scored: `draft.pick` grades against the
 * pack's context rows and this does not read them. Good enough to lay out a
 * screen, and not a measurement of anything -- do not read a fixture's numbers
 * as though a person earned them.
 */
async function botDraft(
  ctx: MutationCtx,
  sessionId: Id<"draftSessions">,
  set: SetData,
  seed: number,
  sloppiness: number,
  fromPickIndex = 0,
  existing: readonly string[] = [],
): Promise<string[]> {
  const engine = new DraftEngine(set, mulberry32(seed));
  const wobble = mulberry32(seed ^ 0x5eed);
  const picked: string[] = [];
  const pool: EngineCard[] = [];

  for (let i = 0; !engine.isComplete(); i++) {
    const pack = engine.currentPack;
    if (pack.length === 0) break;

    // Replay what has already been picked, so this can finish a draft somebody
    // started rather than only deal a fresh one.
    const replaying = i < existing.length;
    const chosen = replaying
      ? pack.find((c) => c.name === existing[i])
      : nth(pack, Math.floor(wobble() * (wobble() < sloppiness ? 3 : 1)));

    if (!chosen) {
      throw new ConvexError(
        `Cannot rebuild this draft at pick ${i + 1}: the set data has changed since it started.`,
      );
    }

    const poolBefore = pool.map((c) => ({ name: c.name, colors: c.colors }));
    const rec = engine.humanPick(chosen);
    pool.push(chosen);
    picked.push(chosen.name);

    if (i >= fromPickIndex) await recordPick(ctx, sessionId, i, rec, poolBefore);
  }

  return picked;
}

const nth = (pack: EngineCard[], n: number): EngineCard =>
  [...pack].sort((a, b) => cardValue(b) - cardValue(a))[Math.min(n, pack.length - 1)];

async function complete(
  ctx: MutationCtx,
  sessionId: Id<"draftSessions">,
  picked: string[],
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) return;

  const set = await setFor(ctx, session.setCode, session.format);
  const engine = new DraftEngine(set, mulberry32(session.seed));
  for (const name of picked) {
    const card = engine.currentPack.find((c) => c.name === name);
    if (card) engine.humanPick(card);
  }
  const { maindeck } = splitPool(engine.humanPool, [], picked.length);

  await ctx.db.patch(sessionId, {
    pickedNames: picked,
    status: "complete" as const,
    completedAt: new Date().toISOString(),
    summary: summarizeDraft(await storedScores(ctx, sessionId), maindeck),
  });
}

/**
 * A challenge pointed AT you, so you can draft it yourself.
 *
 * The half a single developer cannot make: `accept` refuses your own challenge,
 * on purpose, so there is no way to reach the accept path or the drafting that
 * follows it without a second identity. This manufactures the other identity and
 * hands you the link -- from there everything is real. You accept, you make all
 * forty-two picks, your last one stamps the challenge finished and fires the
 * notification, and the diff opens with your own draft on the left.
 */
export const inbound = internalMutation({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    seed: v.optional(v.number()),
    fromName: v.optional(v.string()),
    note: v.optional(v.string()),
    sloppiness: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "TradDraft";
    const seed = (args.seed ?? 20260808) >>> 0;
    const set = await setFor(ctx, setCode, format);

    const sessionId = await ctx.db.insert("draftSessions", {
      userId: challengerId(),
      setCode,
      format,
      seed,
      pickedNames: [],
      status: "active" as const,
      createdAt: new Date().toISOString(),
    });

    const picked = await botDraft(ctx, sessionId, set, seed, args.sloppiness ?? 0.35);
    await complete(ctx, sessionId, picked);

    const challengeId = await ctx.db.insert("challenges", {
      challengerUserId: challengerId(),
      // No real WorkOS user behind this, so the email lookup would find nothing
      // -- which is fine, because the action fails soft on exactly that.
      challengerSubject: `${FIXTURE}subject`,
      challengerSessionId: sessionId,
      setCode,
      format,
      seed,
      fromName: args.fromName ?? "A fixture",
      note: args.note,
      createdAt: new Date().toISOString(),
    });

    return { challengeId, path: `/challenge/${challengeId}`, picks: picked.length };
  },
});

/**
 * A challenge you sent, already drafted and waiting to be read.
 *
 * The other direction, and the fast one: no clicking, straight to the diff with
 * your real draft on one side. Point it at a finished draft of your own.
 */
export const outbound = internalMutation({
  args: {
    sessionId: v.id("draftSessions"),
    sloppiness: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const mine = await ctx.db.get(args.sessionId);
    if (!mine) throw new ConvexError(`No session ${args.sessionId}.`);
    if (mine.status !== "complete") {
      throw new ConvexError(
        `That draft is not finished. Finish it, or bot-finish it with challengeFixture:finish.`,
      );
    }

    const set = await setFor(ctx, mine.setCode, mine.format);
    const now = new Date().toISOString();

    const challengeId = await ctx.db.insert("challenges", {
      challengerUserId: mine.userId ?? challengerId(),
      challengerSubject: `${FIXTURE}subject`,
      challengerSessionId: mine._id,
      setCode: mine.setCode,
      format: mine.format,
      seed: mine.seed,
      createdAt: now,
    });

    const friendSession = await ctx.db.insert("draftSessions", {
      userId: friendId(),
      setCode: mine.setCode,
      format: mine.format,
      seed: mine.seed,
      pickedNames: [],
      status: "active" as const,
      createdAt: now,
      challengeId,
    });

    // Same seed, different hand: this is a real second pod, so the packs come
    // apart exactly where the engine says they do rather than where a fixture
    // decided they should.
    const picked = await botDraft(ctx, friendSession, set, mine.seed, args.sloppiness ?? 0.4);
    await complete(ctx, friendSession, picked);

    await ctx.db.patch(challengeId, {
      friendUserId: friendId(),
      friendSubject: `${FIXTURE}friend`,
      friendSessionId: friendSession,
      acceptedAt: now,
      finishedAt: new Date().toISOString(),
    });

    return { challengeId, path: `/challenge/${challengeId}/diff`, picks: picked.length };
  },
});

/**
 * Bot-finish a draft in progress.
 *
 * For the middle of the loop: accept a fixture challenge, make the first few
 * picks by hand to see the board behave, then skip the remaining thirty-odd
 * rather than clicking them. Keeps the picks already made and drafts on from
 * there, so what you did by hand is still what the diff shows.
 *
 * Stamps the challenge too, because `draft.pick` is what normally does that and
 * this is not going through it.
 */
export const finish = internalMutation({
  args: { sessionId: v.id("draftSessions"), sloppiness: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError(`No session ${args.sessionId}.`);
    if (session.status === "complete") return { already: true, picks: session.pickedNames.length };

    const set = await setFor(ctx, session.setCode, session.format);
    const picked = await botDraft(
      ctx,
      args.sessionId,
      set,
      session.seed,
      args.sloppiness ?? 0.3,
      session.pickedNames.length,
      session.pickedNames,
    );
    await complete(ctx, args.sessionId, picked);

    if (session.challengeId) {
      const challenge = await ctx.db.get(session.challengeId);
      if (challenge && !challenge.finishedAt) {
        await ctx.db.patch(challenge._id, { finishedAt: new Date().toISOString() });
      }
    }

    return { already: false, picks: picked.length };
  },
});

/**
 * Remove every fixture.
 *
 * Findable because fixture sessions are owned by a userId nobody can
 * authenticate as. Deletes their pick rows and any challenge either side of
 * which is one of them -- including challenges whose OTHER side is your real
 * draft, which is the point: those rows say your draft was compared against
 * something that no longer exists.
 */
export const wipe = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("draftSessions")
      .filter((q) =>
        q.or(
          q.eq(q.field("userId"), challengerId()),
          q.eq(q.field("userId"), friendId()),
        ),
      )
      .collect();

    const ids = new Set(sessions.map((s) => s._id as string));

    const challenges = await ctx.db.query("challenges").collect();
    let removedChallenges = 0;
    for (const c of challenges) {
      const touches =
        ids.has(c.challengerSessionId as string) ||
        (c.friendSessionId != null && ids.has(c.friendSessionId as string));
      if (!touches) continue;
      await ctx.db.delete(c._id);
      removedChallenges++;
    }

    let removedRows = 0;
    for (const s of sessions) {
      const rows = await ctx.db
        .query("draftPicks")
        .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", s._id))
        .collect();
      for (const r of rows) {
        await ctx.db.delete(r._id);
        removedRows++;
      }
      await ctx.db.delete(s._id);
    }

    return { sessions: sessions.length, picks: removedRows, challenges: removedChallenges };
  },
});
