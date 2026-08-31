import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { ownedSession, requireUserId } from "./sessions.js";
import { answerSurface } from "./validators.js";

// What somebody answered when the app asked them about a pick they had already
// made. See schema.ts for why the table exists at all; this file is about the
// write.
//
// THE WRITE IS THE FEATURE'S ONLY FAILURE MODE, and it is a quiet one. Nothing
// on screen reads this table yet, so a mutation that throws costs the player
// nothing they can see and costs the measurement everything -- a progression
// readout built on a store that silently drops a tenth of its rows reports
// improvement that is really attrition. Both callers therefore fire this
// without awaiting the result and report a rejection to `answer_unrecorded`,
// which is the only thing that can tell us the store is lossy.
//
// It also must not cost anyone their run, which is the same rule analytics has
// (see CLAUDE.md): a drill whose reveal waited on a round trip, or blanked when
// the round trip failed, would be a worse drill than one that forgot.

export const record = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    asked: answerSurface,
    answered: v.string(),
    // The pick's own two answers, passed in rather than read back off the row.
    //
    // Every caller already holds them -- the drill is handed all three names by
    // `drills.misses.deal` and the review by `review.load` -- so reading
    // `draftPicks` again here would be ~2KB to recover what is in the argument
    // list, on a write that happens once per question answered.
    //
    // The cost of taking them is that a client could send something else. That
    // is bounded by what it buys: this is a record of what a person was shown
    // and answered, and the row a re-ingest may since have re-scored is not it.
    rawBestName: v.string(),
    contextBestName: v.string(),
  },
  handler: async (ctx, args) => {
    // Ownership before anything is written against this session -- the same
    // check `review.saveVerdict` makes, for the same reason, and it is also
    // where `userId` comes from. A client never says whose answer this is.
    const session = await ownedSession(ctx, args.sessionId);
    if (args.pickIndex < 0 || args.pickIndex >= session.pickedNames.length) {
      throw new Error(
        `Session has ${session.pickedNames.length} picks; no pick at index ${args.pickIndex}.`,
      );
    }

    const userId = await requireUserId(ctx);
    const answers = await ctx.db
      .query("pickAnswers")
      .withIndex("by_user_and_pick", (q) =>
        q.eq("userId", userId).eq("sessionId", args.sessionId).eq("pickIndex", args.pickIndex),
      )
      .collect();

    // A duplicate write, and nothing else. Neither surface can answer a
    // question twice inside a run -- both swap the pack for its reveal on the
    // first click -- so the newest row for this surface already naming this
    // card means the mutation arrived twice: a retry, a double-mounted client,
    // a resent request. Inserting it again would show as a repeat, which is the
    // one thing this table must never invent.
    //
    // Exact rather than a time window, deliberately. A window would need a
    // number nothing derives, and would start swallowing real repeats the day
    // somebody plays the same run twice in an evening.
    const latest = answers.filter((a) => a.asked === args.asked).at(-1);
    if (latest && latest.answered === args.answered) return latest._id;

    return await ctx.db.insert("pickAnswers", {
      userId,
      sessionId: args.sessionId,
      pickIndex: args.pickIndex,
      asked: args.asked,
      answered: args.answered,
      rawBestName: args.rawBestName,
      contextBestName: args.contextBestName,
      at: new Date().toISOString(),
    });
  },
});
