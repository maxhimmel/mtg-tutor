import { readProgress } from "@mtg-tutor/core";
import { query } from "../_generated/server.js";
import { requireUserId } from "../sessions.js";

// How somebody is reading the two set-based drills, banded by how hard the
// question was.
//
// WHY THE BANDS RATHER THAN A PERCENTAGE, which is the whole design of this
// query and not a presentation choice. Both banks deal their clearest questions
// first, so the questions somebody meets get harder the longer they play -- and
// a raw accuracy figure over everything therefore FALLS as a player improves.
// It measures the difficulty mix, not the person. Banding on `sigmas` is the one
// cut where that confound stops being a caveat and becomes the x-axis: at four
// error bars everybody is right, at half a one nobody should be, and the middle
// of the axis is where a read is worth having.
//
// FIRST ANSWERS ONLY IN THE BANDS, because the first time a card is put to
// somebody is the only time memory of its reveal cannot be what answered it.
// `askedAgain` beside them is the other half -- what happened when a card came
// back -- and it has two arms rather than the misses drill's four, which is a
// property of the selection rule: only a misread card is ever put back.
//
// A SEPARATE QUERY FROM `stats.progress`, and separate for the reason that one
// is separate from `stats.overview`: they read different tables and answer
// different questions, so folding them would make every drill answer re-run a
// hundred-session average. That one is about picks coming back; this is about
// reading a set.
//
// RAW ROWS, NO ROLLUP, AND THE CEILING IS A NUMBER. This is the unbounded read
// in the feature -- every answer this person has ever given, on both drills --
// where the deal's read is bounded by one set's bank. Convex caps a transaction
// at 32,000 documents scanned, which at eight questions a sitting is about four
// thousand sittings; deferred trade-off #2 made the same call for `llmUsage` and
// named the same trigger. When it binds, the fix is a rollup folded in the same
// mutation as the write, not a narrower index.

export const progress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    // Two reads rather than one over `(userId)`, because the index leads with
    // the drill and a single scan across both would have to be a table scan.
    // They are also two charts on the screen: the subjects differ, so the rates
    // must not pool even though chance is one third in both.
    const read = async (drill: "archetypes" | "deckSpeed") =>
      readProgress(
        await ctx.db
          .query("drillAnswers")
          .withIndex("by_user_drill_set_and_key", (q) =>
            q.eq("userId", userId).eq("drill", drill),
          )
          .collect(),
      );

    return {
      archetypes: await read("archetypes"),
      deckSpeed: await read("deckSpeed"),
    };
  },
});
