import { ConvexError } from "convex/values";
import { replayDraft } from "@mtg-tutor/core";
import type { Card } from "@mtg-tutor/core";
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
 * The card pool for a set. Reads the `setCards` row, falling back to the pool
 * still inline on the `sets` document for rows the split has not reached yet.
 * The fallback goes away once every row is migrated.
 */
export async function setCardsFor(
  ctx: QueryCtx,
  setDoc: Doc<"sets">,
): Promise<Card[]> {
  const cardsDoc = await ctx.db
    .query("setCards")
    .withIndex("by_code_and_format", (q) =>
      q.eq("code", setDoc.code).eq("format", setDoc.format),
    )
    .unique();

  const cards = cardsDoc?.cards ?? setDoc.cards;
  if (!cards) {
    throw new ConvexError(
      `Set "${setDoc.code}" (${setDoc.format}) has no card pool stored. ` +
        `Run the sets:ingest action for it again.`,
    );
  }
  return cards;
}

/**
 * Rebuilds the live board for a session. The session stores only the seed and
 * the picked names, so every read replays -- ~0.16ms for a finished draft,
 * which is nothing next to the round trip that got us here.
 *
 * This is the single choke point every session read and write goes through, so
 * the ownership check lives here rather than being repeated in each function.
 */
export async function loadBoard(ctx: QueryCtx, sessionId: Id<"draftSessions">) {
  const userId = await requireUserId(ctx);
  const session = await ctx.db.get(sessionId);
  if (!session) throw new ConvexError(`No draft session ${sessionId}.`);

  // Sessions created before auth existed have no owner and are unreachable now.
  if (session.userId !== userId) {
    throw new ConvexError(`Draft session ${sessionId} does not belong to you.`);
  }

  const setDoc = await setDocFor(ctx, session.setCode, session.format);
  const cards = await setCardsFor(ctx, setDoc);

  // A session is {seed, pickedNames} replayed against whatever the set data
  // says today, so re-ingesting a set whose packs changed strands every draft
  // taken against the old data. Nothing can repair those -- the packs that
  // draft saw no longer exist -- so this says so, rather than surfacing the
  // engine's divergence message as an uncaught server error.
  let engine;
  try {
    engine = replayDraft(toSetData(setDoc, cards), session.seed, session.pickedNames);
  } catch (e) {
    throw new ConvexError(
      `This draft can no longer be rebuilt: the ${session.setCode.toUpperCase()} ` +
        `card data has changed since it was drafted, so its packs would now deal ` +
        `differently. (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  return { session, engine, setDoc };
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
