import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";

// One-off migrations. Everything here is disposable: once it has run against
// every deployment and the schema has been narrowed, the whole file goes.

/** The (code, format) pairs still carrying any inline draft payload. */
export const unmigratedSets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sets = await ctx.db.query("sets").collect();
    return sets
      .filter(
        (s) =>
          s.cards !== undefined ||
          s.colorPairWinRates !== undefined ||
          s.packComposition !== undefined,
      )
      .map((s) => ({ code: s.code, format: s.format }));
  },
});

/**
 * Moves one set's draft payload -- the pool, the colour-pair win rates and the
 * booster shapes -- out of `sets` and into `setCards`.
 *
 * One set per call, deliberately. A pool is ~240KB, so doing all 17 in a single
 * transaction would read and write several megabytes -- close enough to Convex's
 * per-mutation write ceiling that a trip would roll the whole batch back.
 *
 * Everything is copied through untouched. Every stored draft is {seed,
 * pickedNames} replayed against this pool, so reordering it would deal different
 * packs and strand every session taken against the old order.
 *
 * Resumable at any point: a deployment whose pools moved in an earlier run but
 * whose booster shapes did not is a state this handles, because it takes each
 * field from whichever of the two documents still has it.
 */
export const migrateSetCards = internalMutation({
  args: { code: v.string(), format: v.string() },
  handler: async (ctx, args) => {
    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.code).eq("format", args.format),
      )
      .unique();

    if (!setDoc) {
      throw new Error(`No set ${args.code}/${args.format} to migrate.`);
    }

    const existing = await ctx.db
      .query("setCards")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.code).eq("format", args.format),
      )
      .unique();

    const cards = setDoc.cards ?? existing?.cards;
    if (!cards) {
      throw new Error(
        `Set ${args.code}/${args.format} has no card pool on either document; ` +
          `re-ingest it rather than migrating it.`,
      );
    }

    const payload = {
      code: args.code,
      format: args.format,
      cards,
      colorPairWinRates:
        setDoc.colorPairWinRates ?? existing?.colorPairWinRates ?? [],
      packComposition: setDoc.packComposition ?? existing?.packComposition,
    };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
    } else {
      await ctx.db.insert("setCards", payload);
    }

    // Undefined removes the field, which is the point: the whole exercise is to
    // get these bytes off the document `sets.list` reads.
    await ctx.db.patch(setDoc._id, {
      cardCount: cards.length,
      cards: undefined,
      colorPairWinRates: undefined,
      packComposition: undefined,
    });

    return { status: "migrated" as const, cardCount: cards.length };
  },
});
