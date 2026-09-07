import { readProgress } from "@mtg-tutor/core";
import { query } from "../_generated/server.js";
import { requireUserId } from "../sessions.js";

// How somebody is reading the two set-based drills, banded by how hard the
// question was.
//
// WHY TWO RATES RATHER THAN ONE, which is the whole design of this query and
// not a presentation choice. Most questions in both drills are flat -- the data
// has no opinion about most cards -- so a single accuracy figure mostly measures
// how willing somebody is to answer "the same", and a player who answers it
// every time looks competent. Both drills already name the two mistakes that
// separates, so this counts those against their own denominators: `calledSharp`
// out of the questions with no answer, `calledFlat` out of the ones with one.
//
// AND NOT BANDED BY DIFFICULTY, which two earlier versions of this were. The
// first banded on `sigmas`, which neither drill judges by -- the archetype
// quiz's bar moves with the deck count and deck speed needs a residual floor as
// well as a z test -- so two answers with the same value could be opposite
// questions, and below each gate the answer is fixed by construction. The second
// banded on `margin`, the ratio against each drill's own bar, which is right
// within a drill and wrong across them: over all 25 sets the archetype quiz's
// margins run p50 1.13 and max 2.39 against deck speed's p50 1.81 and max 9.73,
// and 226 of its 242 questions land in one band. A chart of that is one dot and
// two zeroes. `margin` is still stored -- it cannot be recovered later -- and
// `history.ts` says what it is and what it is not.
//
// FIRST ANSWERS ONLY, because the first time a card is put to somebody is the
// only time memory of its reveal cannot be what answered it. `askedAgain` is the
// other half -- what happened when a card came back -- and it has two arms
// rather than the misses drill's four, which is a property of the selection
// rule: only a misread card is ever put back.
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
