import { ConvexError } from "convex/values";
import {
  dealDraft,
  replayDraft,
} from "@mtg-tutor/core";
import type { QueryCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";

import { toSetData } from "./setData.js";

// Shared session plumbing. Not Convex functions -- plain helpers, so that every
// entry point that touches draftSessions goes through the same ownership check
// instead of each re-deriving it.
//
// Everything a client is meant to show a person is thrown as a ConvexError. A
// production deployment replaces a plain Error's message with "Unexpected error
// occurred" -- deliberately, so internals cannot leak -- so a plain throw here
// reads fine in dev and says nothing at all in prod. Carrying a string rather
// than a payload object keeps `error.message` human, which is what every
// existing catch site already renders.

/** Ownership is always derived server-side, never taken as an argument. */
export async function requireUserId(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("You need to be signed in to do that.");
  return identity.tokenIdentifier;
}

export async function setDocFor(
  ctx: QueryCtx,
  setCode: string,
  format: string,
): Promise<Doc<"sets">> {
  const setDoc = await ctx.db
    .query("sets")
    .withIndex("by_code_and_format", (q) => q.eq("code", setCode).eq("format", format))
    .unique();

  if (!setDoc) {
    throw new ConvexError(
      `Set "${setCode}" (${format}) has not been ingested yet. ` +
        `Run the sets:ingest action for it first.`,
    );
  }
  return setDoc;
}

/**
 * Everything a replay needs for a set: the pool, the colour-pair win rates and
 * the booster shapes. A separate row from the metadata in `sets`, which is what
 * keeps listing sets cheap -- see schema.ts.
 */
export async function setCardsFor(
  ctx: QueryCtx,
  setDoc: Doc<"sets">,
): Promise<Doc<"setCards">> {
  const cardsDoc = await ctx.db
    .query("setCards")
    .withIndex("by_code_and_format", (q) =>
      q.eq("code", setDoc.code).eq("format", setDoc.format),
    )
    .unique();

  if (!cardsDoc) {
    throw new ConvexError(
      `Set "${setDoc.code}" (${setDoc.format}) has no card pool stored. ` +
        `Run the sets:ingest action for it again.`,
    );
  }
  return cardsDoc;
}

/**
 * Rebuilds the live board for a session. The session stores only the seed and
 * the picked names, so every read replays -- ~0.16ms for a finished draft,
 * which is nothing next to the round trip that got us here.
 *
 * This is the single choke point every session read and write goes through, so
 * the ownership check lives here rather than being repeated in each function.
 */
/**
 * The ownership check on its own, without the replay below it.
 *
 * Most reads want the board and should call loadBoard. Anything that only needs
 * to prove the session is yours -- metrics about it, say -- wants this instead:
 * replaying costs a read of the ~240KB card pool, which is a lot to spend on a
 * question about a few hundred bytes of someone else's rows.
 */
export async function ownedSession(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
): Promise<Doc<"draftSessions">> {
  const userId = await requireUserId(ctx);
  const session = await ctx.db.get(sessionId);
  if (!session) throw new ConvexError(`No draft session ${sessionId}.`);

  // Sessions created before auth existed have no owner and are unreachable now.
  if (session.userId !== userId) {
    throw new ConvexError(`Draft session ${sessionId} does not belong to you.`);
  }
  return session;
}

export async function loadBoard(ctx: QueryCtx, sessionId: Id<"draftSessions">) {
  return await replayFor(ctx, await ownedSession(ctx, sessionId));
}

/**
 * A challenge link, held by whoever it was sent to.
 *
 * The id IS the capability -- that is what a link is -- so this asks only that
 * the caller is signed in. Deliberately NOT `ownedSession`: an invitation that
 * only its author can open is not an invitation, and on the landing page the
 * person it was written for is by definition not yet on the row. It grants
 * reading the offer and taking it up, and nothing else. The two drafts behind it
 * need `challengeParty` below.
 *
 * A revoked or already-taken challenge is returned rather than refused, so the
 * caller can be told which of those happened instead of being told the link is
 * broken. Whether they may ACT on it is `challenges.accept`'s question.
 */
export async function challengeInvite(
  ctx: QueryCtx,
  challengeId: Id<"challenges">,
): Promise<Doc<"challenges">> {
  await requireUserId(ctx);
  const challenge = await ctx.db.get(challengeId);
  if (!challenge) throw new ConvexError("That link is not a challenge.");
  return challenge;
}

/**
 * A challenge and which side of it the caller is on.
 *
 * The one exception to `ownedSession` in the app, and a separate function rather
 * than a flag on it for two reasons. `ownedSession` answers "is this session
 * yours", this answers "are you one of the two people this row names" -- a
 * different question, so a different name. And `ownedSession` runs on the pick
 * path forty-two times a draft, where a widened check is a place to be silently
 * wrong forever.
 *
 * No such row and not your row refuse in the SAME sentence, on purpose. Convex
 * ids are unguessable, so distinguishing them leaks nothing an attacker could
 * reach -- but it would answer "does this challenge exist" to anyone who asked,
 * and there is no reason to answer it.
 */
export async function challengeParty(
  ctx: QueryCtx,
  challengeId: Id<"challenges">,
): Promise<{ challenge: Doc<"challenges">; side: "challenger" | "friend" }> {
  const userId = await requireUserId(ctx);
  const challenge = await ctx.db.get(challengeId);

  if (challenge?.challengerUserId === userId) return { challenge, side: "challenger" };
  if (challenge?.friendUserId === userId) return { challenge, side: "friend" };

  throw new ConvexError("That challenge is not yours to read.");
}

/**
 * The replay on its own, for a session already in hand.
 *
 * Split from loadBoard because ownership is a question about the CALLER, and a
 * migration has none -- it runs as the system, over everyone's sessions. Every
 * request path goes through loadBoard and is checked; this is the one door that
 * is deliberately not, and it is not exported to any Convex function.
 */
export async function replayFor(ctx: QueryCtx, session: Doc<"draftSessions">) {
  const setDoc = await setDocFor(ctx, session.setCode, session.format);
  const cardsDoc = await setCardsFor(ctx, setDoc);

  // A session is {seed, pickedNames} replayed against whatever the set data
  // says today, so re-ingesting a set whose packs changed strands every draft
  // taken against the old data. Nothing can repair those -- the packs that
  // draft saw no longer exist -- so this says so, rather than surfacing the
  // engine's divergence message as an uncaught server error.
  let engine;
  try {
    engine = replayDraft(
      dealDraft(toSetData(cardsDoc), session.seed),
      session.seed,
      session.pickedNames,
      undefined,
      // Absent means the original bot, which is what every draft taken before
      // pods existed was dealt by. See draftSessions.pod.
      session.pod ?? "legacy",
    );
  } catch (e) {
    throw new ConvexError(
      `This draft can no longer be rebuilt: the ${session.setCode.toUpperCase()} ` +
        `card data has changed since it was drafted, so its packs would now deal ` +
        `differently. (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  return { session, engine, setDoc, cardsDoc };
}

/**
 * Whether a draft was dealt from set data that has since moved on.
 *
 * Three answers, not two. `undefined` means the question cannot be answered --
 * the session predates the stamp, or the set was ingested with no artifact to
 * hash -- and it must not collapse to `false`, because "we cannot tell" and
 * "this is fine" lead a reader to opposite conclusions and only one of them is
 * safe. A truthy check on the return value is the bug this shape exists to make
 * visible.
 *
 * A hint for a list, never a guard: see the note on `draftSessions.sourceHash`
 * for the two ways a pool changes without the hash following it.
 */
export function staleAgainst(
  sessionHash: string | undefined,
  liveHash: string | undefined,
): boolean | undefined {
  if (sessionHash === undefined || liveHash === undefined) return undefined;
  return sessionHash !== liveHash;
}

/** The caller's sessions, newest first. */
export async function ownSessions(
  ctx: QueryCtx,
  limit: number,
): Promise<Doc<"draftSessions">[]> {
  const userId = await requireUserId(ctx);
  return await ctx.db
    .query("draftSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}
