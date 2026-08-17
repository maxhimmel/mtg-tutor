import { v } from "convex/values";
import { normalizeBench } from "@mtg-tutor/core";
import { internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";

/**
 * Gives every stored bench the pick it happened at.
 *
 * `draftSessions.sideboard` used to be bare positions, which recorded what the
 * player set aside but not when -- so the only readable answer was "as it stands
 * now", and a cut made at pick 40 rewrote the context of every pick before it.
 *
 * A pre-clock bench applied to every pick that could see the card, and
 * `atPick = pos` is the reading that reproduces that exactly: sidelined from the
 * moment it was drafted. `normalizeBench` does the same conversion on read, so
 * this changes no behaviour -- it exists so the union arm can come off the
 * schema once both deployments have run it.
 */
export const stampBenchClock = internalMutation({
  args: { after: v.optional(v.number()), stamped: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ stamped: number; complete: boolean; after?: number }> => {
    const stamped = args.stamped ?? 0;

    const batch = await ctx.db
      .query("draftSessions")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", args.after ?? 0))
      .take(200);

    if (batch.length === 0) {
      console.log(`stampBenchClock: complete, ${stamped} row(s)`);
      return { stamped, complete: true };
    }

    let n = stamped;
    for (const row of batch) {
      if (row.sideboard?.some((b) => typeof b === "number")) {
        await ctx.db.patch(row._id, { sideboard: normalizeBench(row.sideboard) });
        n++;
      }
    }

    const next = { after: batch[batch.length - 1]._creationTime, stamped: n };
    await ctx.scheduler.runAfter(0, internal.migrations.stampBenchClock, next);
    return { ...next, complete: false };
  },
});

/**
 * Deletes every draft, its picks, and everything hanging off them.
 *
 * ONE-OFF, AND MEANT TO BE DELETED once both deployments have run it. Storing
 * the deal changed what a seed deals -- see core's deal.ts -- so no session
 * written before it can be replayed, and the schema that drops
 * `draftSessions.sourceHash` will not deploy over rows that still carry it.
 * Migrating them is impossible in principle rather than merely expensive: the
 * packs those drafts saw were a function of set data plus a shared rng stream,
 * and both have moved.
 *
 * Deliberately NOT touching the ingest-pipeline tables. `sets`, `setCards`,
 * `setCardText`, `setCardContext`, `setStats` and `setStatsMeta` are rebuilt by
 * a crawl that costs real time and a Scryfall round trip per set, and nothing
 * here has any business in them.
 *
 * `feedback` is kept too, and that is a judgement rather than an oversight: a
 * note records what somebody experienced, and its anchor going dangling does
 * not make the sentence they typed untrue.
 *
 * Order matters: rows that point at a session go before the session does, so a
 * failure part-way leaves no row pointing at nothing.
 */
export const wipeDrafts = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "yes-delete-every-draft") {
      throw new Error(
        'Refusing: pass {"confirm": "yes-delete-every-draft"} if that is what you mean.',
      );
    }

    const tables = [
      "draftPools",
      "draftPicks",
      "reviewVerdicts",
      "reviewFrames",
      "challenges",
      "draftSessions",
    ] as const;

    const deleted: Record<string, number> = {};
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      deleted[table] = rows.length;
    }
    return deleted;
  },
});
