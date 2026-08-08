import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { challengeAccepted, challengeIssued } from "./analytics.js";
import { startSession } from "./draft.js";
import { requireCaller } from "./roles.js";
import { challengeInvite, ownedSession, replayFor } from "./sessions.js";

// Daring a friend to draft the packs you just drafted.
//
// The deal itself was already free: a draft is {seed, pickedNames} replayed and
// `draft.start` has always taken an optional seed, so dealing two people the
// same boosters needed no new engine. What this file adds is the offer, who may
// take it, and the one row that lets two people read each other's picks.
//
// LIVE POD, NOT REPLAYED PACKS. Handing the friend a recording of your 45 packs
// was prototyped and rejected: it aligns every row and makes their picks inert,
// because nothing they take changes what wheels back. That switches off signal
// reading and wheeling, which is most of what a draft teaches, and leaves a
// multiple-choice quiz with your answer key. So the two of them sit in separate
// pods off one seed, the packs are identical only until the wheel brings the
// first divergence round, and the comparison says out loud where it stops being
// one. See notes.md Ideas #8.

// Unverified text that lands on a page and in a subject line. Same treatment as
// access.ts gives a stranger's note, for the same reason.
const MAX = { fromName: 40, note: 280 };

/** What both the list and the landing page call the state. Derived, never stored. */
export type ChallengeState = "open" | "accepted" | "finished" | "revoked";

export function stateOf(challenge: Doc<"challenges">): ChallengeState {
  if (challenge.finishedAt) return "finished";
  if (challenge.revokedAt) return "revoked";
  if (challenge.acceptedAt) return "accepted";
  return "open";
}

/**
 * `finished` outranks `revoked` above, which looks like the wrong order until
 * you try the other one: revoking is illegal once accepted, so the only way to
 * hold both stamps is to revoke an open challenge that somebody was already
 * mid-draft on. Their draft still finished and the diff is still readable, and
 * calling that row "withdrawn" would hide a comparison both people can open.
 */

export const create = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    fromName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const session = await ownedSession(ctx, args.sessionId);

    // You cannot dare somebody to beat a draft you have not taken. The lab
    // found this one by walking into it: a challenge issued mid-draft has no
    // second side to compare against and no honest way to describe itself.
    if (session.status !== "complete") {
      throw new ConvexError("Finish this draft before challenging anyone with it.");
    }

    // The set, format and seed are COPIED rather than read through the session
    // later. A challenge is an offer of a particular deal, and it should not
    // quietly become an offer of a different one.
    const challengeId = await ctx.db.insert("challenges", {
      challengerUserId: caller.userId,
      challengerSubject: caller.subject,
      challengerSessionId: session._id,
      setCode: session.setCode,
      format: session.format,
      seed: session.seed,
      fromName: args.fromName?.trim().slice(0, MAX.fromName) || undefined,
      note: args.note?.trim().slice(0, MAX.note) || undefined,
      createdAt: new Date().toISOString(),
    });

    // After the write, on a path that has committed -- see analytics.ts.
    await challengeIssued(ctx, {
      challengeId,
      setCode: session.setCode,
      format: session.format,
    });

    return challengeId;
  },
});

export const revoke = mutation({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await ctx.db.get(args.challengeId);

    if (!challenge || challenge.challengerUserId !== caller.userId) {
      throw new ConvexError("That challenge is not yours to withdraw.");
    }
    // By now the friend has spent one of their three drafts for the day on it.
    // Taking the link back would not give that back, and it would strand a diff
    // both of them are entitled to.
    if (challenge.acceptedAt) {
      throw new ConvexError("Somebody has already taken this challenge.");
    }
    if (challenge.revokedAt) return;

    await ctx.db.patch(challenge._id, { revokedAt: new Date().toISOString() });
  },
});

/**
 * Taking a challenge up: the friend's own draft, off the challenger's seed.
 *
 * The refusals are ordered the way the rest of the stack refuses -- who you are,
 * then whether this offer is takeable, then whether the deal still exists, then
 * the quota -- because only the last of those costs anything, and a person who
 * cannot take this challenge at all should not spend a draft finding out.
 */
export const accept = mutation({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await challengeInvite(ctx, args.challengeId);

    if (challenge.challengerUserId === caller.userId) {
      throw new ConvexError("This is your own challenge -- you drafted these packs already.");
    }
    if (challenge.friendUserId) {
      // Including when it is this caller: `accept` deals a draft, so making it
      // idempotent would quietly hand somebody a second one. The landing page
      // sends them to the draft they already have.
      throw new ConvexError("Somebody has already taken this challenge.");
    }
    if (challenge.revokedAt) {
      throw new ConvexError("This challenge was withdrawn.");
    }

    // THE STALENESS GUARD, and it is a replay rather than a hash comparison.
    //
    // A challenge is a seed that outlives the moment it was made, so it meets a
    // re-ingested set far more often than a same-day draft does. Comparing
    // `sets.sourceHash` would be cheaper and would miss two real cases: the hash
    // is absent when a set is ingested with no artifact to hand, and unchanged
    // by `ingest-sets --force`, which re-crawls Scryfall under the same one.
    //
    // Replaying the challenger's own session asks the exact question instead --
    // would this seed still deal the packs they actually took from -- and it is
    // one ~46KB read on a path that runs once. Dealing the friend a pod that
    // cannot be compared to the challenger's is the failure this exists to
    // prevent, and it is silent: both drafts work, and the diff is nonsense.
    const challengerSession = await ctx.db.get(challenge.challengerSessionId);
    if (!challengerSession) {
      throw new ConvexError("The draft behind this challenge is gone.");
    }
    try {
      await replayFor(ctx, challengerSession);
    } catch {
      throw new ConvexError(
        `The ${challenge.setCode.toUpperCase()} card data has changed since this challenge ` +
          `was made, so these packs would no longer deal the same way. Ask for a new one.`,
      );
    }

    // Last, so everything above refuses for free. `startSession` runs the quota
    // inside this transaction, so a throw below rolls the token back with it.
    const sessionId = await startSession(ctx, caller, {
      setCode: challenge.setCode,
      format: challenge.format,
      seed: challenge.seed,
      challengeId: challenge._id,
    });

    await ctx.db.patch(challenge._id, {
      friendUserId: caller.userId,
      friendSubject: caller.subject,
      friendSessionId: sessionId,
      acceptedAt: new Date().toISOString(),
    });

    await challengeAccepted(ctx, {
      challengeId: challenge._id,
      setCode: challenge.setCode,
      format: challenge.format,
      hoursSinceIssued: Math.round(
        (Date.now() - Date.parse(challenge.createdAt)) / (60 * 60 * 1000),
      ),
    });

    return sessionId;
  },
});

/**
 * Every challenge the caller is on either side of, newest first.
 *
 * This IS the inbox. A notifications table would be a second record of a thing
 * these rows already say, and `useQuery` is reactive, so the unread badge needs
 * no polling and no extra plumbing -- it is a count over this answer.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);

    const [issued, taken] = await Promise.all([
      ctx.db
        .query("challenges")
        .withIndex("by_challenger", (q) => q.eq("challengerUserId", caller.userId))
        .order("desc")
        .take(50),
      ctx.db
        .query("challenges")
        .withIndex("by_friend", (q) => q.eq("friendUserId", caller.userId))
        .order("desc")
        .take(50),
    ]);

    const rows = [...issued, ...taken].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return rows.map((c) => ({
      id: c._id,
      side: c.challengerUserId === caller.userId ? ("challenger" as const) : ("friend" as const),
      state: stateOf(c),
      setCode: c.setCode,
      format: c.format,
      fromName: c.fromName,
      note: c.note,
      createdAt: c.createdAt,
      acceptedAt: c.acceptedAt,
      finishedAt: c.finishedAt,
      // What the badge counts. Only the challenger has something to be told:
      // the friend was present when their own draft ended.
      unread: c.challengerUserId === caller.userId && c.finishedAt != null && c.challengerSeenAt == null,
    }));
  },
});

/**
 * The offer, for whoever is holding the link.
 *
 * Answers for a signed-in stranger, because that is the whole point of a link
 * -- see `challengeInvite`. It says what the deal is and what has become of it,
 * and deliberately nothing about either draft: the picks are behind
 * `challengeParty`, and the person reading this page has not drafted yet.
 */
export const invitation = query({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await challengeInvite(ctx, args.challengeId);

    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", challenge.setCode).eq("format", challenge.format),
      )
      .unique();

    const mine = challenge.challengerUserId === caller.userId;

    return {
      id: challenge._id,
      state: stateOf(challenge),
      setCode: challenge.setCode,
      format: challenge.format,
      setName: setDoc?.name,
      iconUri: setDoc?.iconUri,
      fromName: challenge.fromName,
      note: challenge.note,
      createdAt: challenge.createdAt,
      // Your own link, which is a state rather than an error: the challenger
      // opens it to check it works, and telling them it is not theirs would be
      // both wrong and confusing.
      mine,
      takenByMe: challenge.friendUserId === caller.userId,
      // Deliberately no staleness hint. Only a replay answers whether this seed
      // still deals the packs the challenger drafted from, `accept` does that
      // replay and refuses in a sentence, and a cheaper guess here would either
      // read the challenger's session for a field or warn about a hash that is
      // unchanged by `ingest-sets --force`. One honest answer, at the one moment
      // it decides anything.
    };
  },
});
