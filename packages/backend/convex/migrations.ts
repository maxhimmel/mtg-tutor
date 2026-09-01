import { v } from "convex/values";
import { DIAL_FINGERPRINT, dialsForDraft, normalizeBench } from "@mtg-tutor/core";
import { internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { dialRows } from "./draftDigests.js";
import { storedPicks } from "./draftPicks.js";

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
 * Gives every finished draft the curvature that says how its drafter picks.
 *
 * WHY THIS IS WORTH A BACKFILL WHEN DRAFT DATA IS OTHERWISE DISPOSABLE
 *
 * The readout needs five to ten drafts before it can say anything -- measured,
 * not guessed. Forward-only, every player starts from nothing and the feature is
 * a promise for a month; with the history in, most of them have a readout the
 * day it ships. That is the whole difference between a thing people use and a
 * thing they are told about.
 *
 * IT IS THE EXPENSIVE KIND OF READ, WHICH IS WHY IT IS A ONE-OFF
 *
 * A draft's pick rows are ~92KB, because every one carries the pack it saw --
 * that is exactly the read `draftDigests` exists to stop `stats.overview` doing
 * on every page view. Paying it once per draft, ever, is the trade this makes,
 * and twenty at a time is a batch small enough that no single transaction reads
 * more than a couple of megabytes.
 *
 * Idempotent by fingerprint rather than by presence, so a refit of the yardstick
 * or a change to the bundles re-runs this and repairs the stale ones instead of
 * skipping them for having something already.
 */
export const backfillDials = internalMutation({
  args: { after: v.optional(v.number()), written: v.optional(v.number()), skipped: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ written: number; skipped: number; complete: boolean; after?: number }> => {
    const written = args.written ?? 0;
    const skipped = args.skipped ?? 0;

    const batch = await ctx.db
      .query("draftDigests")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", args.after ?? 0))
      .take(20);

    if (batch.length === 0) {
      console.log(`backfillDials: complete, ${written} written, ${skipped} unmeasurable`);
      return { written, skipped, complete: true };
    }

    let wrote = written;
    let missed = skipped;
    for (const digest of batch) {
      if (digest.dials?.fingerprint === DIAL_FINGERPRINT) continue;
      const dials = dialsForDraft(dialRows(await storedPicks(ctx, digest.sessionId)));
      if (!dials) {
        // A pool with no pick order, or a draft with no decision in it. Counted
        // rather than passed over: if this number is large, the readout is going
        // to be empty for people who have drafted plenty, and the log is the
        // only place that would say so before they noticed.
        missed++;
        continue;
      }
      await ctx.db.patch(digest._id, { dials });
      wrote++;
    }

    const next = {
      after: batch[batch.length - 1]._creationTime,
      written: wrote,
      skipped: missed,
    };
    await ctx.scheduler.runAfter(0, internal.migrations.backfillDials, next);
    return { ...next, complete: false };
  },
});
