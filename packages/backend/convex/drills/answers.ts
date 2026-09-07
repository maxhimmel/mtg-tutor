import { v } from "convex/values";
import { normalizeName } from "@mtg-tutor/core";
import { mutation } from "../_generated/server.js";
import { requireUserId } from "../sessions.js";
import { setDrillId } from "../validators.js";

// What somebody answered in one of the two set-based drills. See `drillAnswers`
// in schema.ts for why the table exists; this file is about the write.
//
// THE WRITE IS THE FEATURE'S ONLY QUIET FAILURE, and it is the same one
// `pickAnswers.ts` describes. Everything that reads this table reads it later --
// the next run's deal, the panel on /stats -- so a mutation that throws costs
// the player nothing they can see now and costs the measurement everything. A
// store that silently drops a tenth of its rows reports improvement that is
// really attrition, and it also re-deals cards somebody has already answered,
// which is the defect this table was added to fix. Both clients therefore fire
// this without awaiting it and report a rejection to `answer_unrecorded`, which
// is the only thing that can tell us the store has gone lossy.
//
// It also must not cost anybody their run, which is the rule analytics has: a
// reveal that waited on a round trip, or blanked when the round trip failed,
// would be a worse drill than one that forgot.

export const record = mutation({
  args: {
    drill: setDrillId,
    setCode: v.string(),
    format: v.optional(v.string()),
    /** The card. Normalised here so a caller cannot key a row differently. */
    name: v.string(),
    answered: v.string(),
    // The question's own answer and sharpness, passed in rather than re-derived.
    //
    // Every caller was handed both by `deal`, and recovering them here would
    // mean re-reading a set's 270-412KB statistics document on a write that
    // happens once per question answered -- the same trade `pickAnswers` prices
    // for the two candidate names.
    //
    // What that costs is that a client could send something else, and it is
    // bounded by what it buys: this is a record of what a person was shown and
    // answered. A row re-derived from statistics that have since moved is not
    // that record, which is the whole reason `correct` is stored at all.
    correct: v.string(),
    sigmas: v.number(),
    /** How far past its gate the question sat. See schema.ts. */
    margin: v.number(),
    // Which sitting this is, minted by the client: one id per question per run.
    attemptId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const format = args.format ?? "TradDraft";
    const key = normalizeName(args.name);

    const answers = await ctx.db
      .query("drillAnswers")
      .withIndex("by_user_drill_set_and_key", (q) =>
        q
          .eq("userId", userId)
          .eq("drill", args.drill)
          .eq("setCode", args.setCode)
          .eq("format", format)
          .eq("key", key),
      )
      .collect();

    // A duplicate write and nothing else: a retry, a double-click, a resent
    // request. The client mints one id per question per run and neither drill
    // can ask a question twice inside a run, so the newest row already carrying
    // this attempt's id means the mutation arrived twice.
    //
    // ON THE ID AND NOT ON THE ANSWER, which is the trap `pickAnswers` fell into
    // and wrote down: refusing a row because it says what the last one said is
    // refusing somebody standing by their read, which is exactly the event worth
    // counting. Here it would also break the drill outright -- a card is only
    // ever put back BECAUSE it was misread, so a second wrong answer is the
    // commonest thing that can happen and is `stillWrong`, not a duplicate.
    const latest = answers.at(-1);
    if (latest && latest.attemptId === args.attemptId) return latest._id;

    return await ctx.db.insert("drillAnswers", {
      userId,
      drill: args.drill,
      setCode: args.setCode,
      format,
      key,
      answered: args.answered,
      correct: args.correct,
      sigmas: args.sigmas,
      margin: args.margin,
      attemptId: args.attemptId,
      at: new Date().toISOString(),
    });
  },
});
