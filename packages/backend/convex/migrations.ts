import { v } from "convex/values";
import type { PoolCard } from "@mtg-tutor/core";
import { normalizeName, withPackSlots } from "@mtg-tutor/core";
import { internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { engineHalf, textHalf } from "./cardText.js";
import { recordPick } from "./draftPicks.js";
import { replayFor } from "./sessions.js";
import type { StoredCard } from "./validators.js";

/**
 * Removes `draftSessions.saved`, which has been dead for a while.
 *
 * A draft was never opt-in -- the row is inserted before the first pick and
 * nothing is ever deleted -- so nothing has written it since, and no query has
 * read it since stats and review moved to ownSessions. It stayed on the schema
 * as an optional field purely so the rows still carrying it would validate.
 * notes.md called it a migration for whenever this table was next touched.
 *
 * Patching a field to undefined is how Convex removes it.
 */
export const dropSavedFlag = internalMutation({
  args: { after: v.optional(v.number()), dropped: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ dropped: number; complete: boolean; after?: number }> => {
    const dropped = args.dropped ?? 0;

    const batch = await ctx.db
      .query("draftSessions")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", args.after ?? 0))
      .take(200);

    if (batch.length === 0) {
      console.log(`dropSavedFlag: complete, ${dropped} row(s)`);
      return { dropped, complete: true };
    }

    let n = dropped;
    for (const row of batch) {
      if (row.saved !== undefined) {
        await ctx.db.patch(row._id, { saved: undefined });
        n++;
      }
    }

    const next = { after: batch[batch.length - 1]._creationTime, dropped: n };
    await ctx.scheduler.runAfter(0, internal.migrations.dropSavedFlag, next);
    return { ...next, complete: false };
  },
});

/**
 * Writes the pick records for sessions drafted before draftPicks existed.
 *
 * Replays each session once -- which is exactly what the coach and the review
 * verdict used to do on every call -- and keeps the result. One session per
 * transaction: a replay reads the set's pool, and doing a hundred of those
 * together would not fit.
 *
 * Walks every session by creation time, skipping those already recorded and
 * those that can no longer be rebuilt at all.
 */
export const backfillDraftPicks = internalMutation({
  args: { after: v.optional(v.number()), done: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ done: number; complete: boolean; after?: number }> => {
    const done = args.done ?? 0;
    const after = args.after ?? 0;

    // A creation-time cursor rather than "the first session missing rows",
    // because a session that cannot be replayed can never get rows and would be
    // picked again forever.
    const target = await ctx.db
      .query("draftSessions")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", after))
      .first();

    if (!target) {
      console.log(`backfillDraftPicks: complete, ${done} session(s)`);
      return { done, complete: true };
    }

    const next = { after: target._creationTime, done };

    const existing = await ctx.db
      .query("draftPicks")
      .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", target._id))
      .collect();

    if (target.pickedNames.length === 0 || existing.length === target.pickedNames.length) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillDraftPicks, next);
      return { ...next, complete: false };
    }

    // Partially written means an earlier run died mid-session; start it over
    // rather than guess which indexes are missing.
    for (const row of existing) await ctx.db.delete(row._id);

    let engine;
    try {
      engine = (await replayFor(ctx, target)).engine;
    } catch (e) {
      // A draft taken against set data that has since been re-ingested cannot
      // be rebuilt: the packs it saw no longer exist. Those sessions were
      // already unreadable before this table existed, and nothing here can
      // repair them -- so the cursor steps past rather than dying on the first
      // one and stranding every session behind it.
      console.warn(
        `backfillDraftPicks: ${target._id} cannot be rebuilt, skipping -- ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
      await ctx.scheduler.runAfter(0, internal.migrations.backfillDraftPicks, next);
      return { ...next, complete: false };
    }

    const pool: PoolCard[] = [];
    for (const [pickIndex, rec] of engine.history.entries()) {
      await recordPick(ctx, target._id, pickIndex, rec, [...pool]);
      pool.push({ name: rec.picked.name, colors: rec.picked.colors });
    }
    console.log(`backfillDraftPicks: ${target._id}, ${engine.history.length} picks`);

    await ctx.scheduler.runAfter(0, internal.migrations.backfillDraftPicks, {
      ...next,
      done: done + 1,
    });
    return { ...next, done: done + 1, complete: false };
  },
});

/**
 * Splits the card pools that predate setCardText.
 *
 * Everything the split needs is already in the documents -- a stored card was
 * whole -- so this reads no Scryfall and can run on a deployment whose sets
 * would otherwise need seventeen paginated crawls to rebuild. That matters
 * beyond convenience: those crawls are what earned this project a 429 before.
 *
 * One set per transaction, rescheduling itself until none are left. A set is
 * ~170KB to read and ~300 text rows to write, so a handful would fit together
 * and all of them would not; per-set keeps it well clear either way.
 *
 * A pool is migrated when its cards no longer carry a type line -- the field is
 * required on a whole card and absent from the engine's half, so it answers
 * "has this row been split yet" without a flag to clean up afterwards.
 */
export const splitStoredCards = internalMutation({
  args: { migrated: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ migrated: number; done: boolean }> => {
    const migrated = args.migrated ?? 0;

    const pending = await ctx.db
      .query("setCards")
      .filter((q) => q.neq(q.field("cards"), []))
      .collect();

    const next = pending.find((doc) =>
      doc.cards.some((c) => (c as { typeLine?: string }).typeLine !== undefined),
    );

    if (!next) {
      console.log(`splitStoredCards: done, ${migrated} pool(s) migrated`);
      return { migrated, done: true };
    }

    // Slots are stamped here for the same reason ingest stamps them: the type
    // line is about to be removed from this side of the card, and the partition
    // has to survive it.
    // Cast justified by the predicate that selected this row: it is here only
    // because its cards still carry a type line, which is to say they are whole.
    const whole = withPackSlots(next.code, next.cards as StoredCard[]);

    const stale = await ctx.db
      .query("setCardText")
      .withIndex("by_code_format_and_key", (q) =>
        q.eq("code", next.code).eq("format", next.format),
      )
      .collect();
    for (const row of stale) await ctx.db.delete(row._id);

    for (const c of whole) {
      await ctx.db.insert("setCardText", {
        code: next.code,
        format: next.format,
        key: normalizeName(c.name),
        text: textHalf(c),
      });
    }

    await ctx.db.patch(next._id, { cards: whole.map(engineHalf) });
    console.log(`splitStoredCards: ${next.code}/${next.format}, ${whole.length} cards`);

    await ctx.scheduler.runAfter(0, internal.migrations.splitStoredCards, {
      migrated: migrated + 1,
    });
    return { migrated: migrated + 1, done: false };
  },
});
