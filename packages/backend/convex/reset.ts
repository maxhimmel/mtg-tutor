import { v } from "convex/values";
import { internalMutation } from "./_generated/server.js";

// Throwing away everybody's drafts, on purpose.
//
// WHY THIS IS A KEEPER RATHER THAN A ONE-OFF
//
// Draft data is derived, not authored. A session is a deal plus the names its
// owner picked, and everything else -- the picks, the digests, the verdicts, the
// frames -- is downstream of those. So the answer to "this schema change cannot
// be migrated" is almost always to throw the drafts away and take another one,
// which is a thing worth being able to do in one command rather than by hand in
// the dashboard at the moment you are already annoyed.
//
// It exists because storing the deal made every draft ever taken unreplayable
// in a single commit, and that will happen again: any change to `cardValue`, to
// the bot policy, or to how packs are sampled has the same effect. corpus.test.ts
// is the tripwire that says so.
//
// WHAT IT WILL NOT TOUCH
//
// The ingest pipeline: `sets`, `setCards`, `setCardText`, `setCardContext`,
// `setStats`, `setStatsMeta`. Those cost a Scryfall crawl and real minutes to
// rebuild, and nothing here has any business in them -- which is the whole
// reason this is a named list rather than "every table".
//
// `feedback` and `accessRequests` are also kept, and that is a judgement rather
// than an oversight. A note records what somebody experienced and a request
// records that somebody asked to be let in; neither becomes untrue because the
// draft it pointed at is gone.
//
// `llmUsage` is kept too: it is what `bench-report` reads to compare token
// spend across runs, and those runs are the record of a measurement rather than
// of a draft.
const WIPES = [
  // Rows that point at a session go before the session does, so a failure
  // part-way through leaves nothing pointing at something that is not there.
  "draftPools",
  "draftDigests",
  "draftPicks",
  "reviewVerdicts",
  "reviewFrames",
  "challenges",
  "draftSessions",
] as const;

export const wipeDrafts = internalMutation({
  args: {
    /**
     * Deliberately awkward, and not a boolean.
     *
     * `--prod` is one flag away from any `npx convex run`, and the CLI holds
     * deployment admin credentials, so the only thing standing between a tired
     * evening and everyone's drafts is having to type the sentence out.
     * `scripts/wipe-drafts.mjs` passes it for you and structurally cannot reach
     * production; this argument is what makes the raw CLI path deliberate too.
     */
    confirm: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== "yes-delete-every-draft") {
      throw new Error(
        'Refusing: pass {"confirm": "yes-delete-every-draft"} if that is what you mean.',
      );
    }

    const deleted: Record<string, number> = {};
    for (const table of WIPES) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      deleted[table] = rows.length;
    }
    return deleted;
  },
});
