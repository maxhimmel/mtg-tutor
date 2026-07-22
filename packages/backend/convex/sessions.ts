import { replayDraft } from "@mtg-tutor/core";
import type { QueryCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { toSetData } from "./setData.js";

// Shared session plumbing. Not Convex functions -- plain helpers, so that every
// entry point that touches draftSessions goes through the same ownership check
// instead of each re-deriving it.

/** Ownership is always derived server-side, never taken as an argument. */
export async function requireUserId(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated.");
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
    throw new Error(
      `Set "${setCode}" (${format}) has not been ingested yet. ` +
        `Run the sets:ingest action for it first.`,
    );
  }
  return setDoc;
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
  if (!session) throw new Error(`No draft session ${sessionId}.`);

  // Sessions created before auth existed have no owner and are unreachable now.
  if (session.userId !== userId) {
    throw new Error(`Draft session ${sessionId} does not belong to you.`);
  }

  const setDoc = await setDocFor(ctx, session.setCode, session.format);
  const engine = replayDraft(toSetData(setDoc), session.seed, session.pickedNames);

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
